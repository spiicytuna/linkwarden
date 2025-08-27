import { Collection, Link, User } from "@linkwarden/prisma/client";
import { Page } from "playwright";
import { generatePreview } from "../generatePreview";
import { createFile } from "@linkwarden/filesystem";
import { prisma } from "@linkwarden/prisma";

type LinksAndCollectionAndOwner = Link & {
  collection: Collection & {
    owner: User;
  };
};

const handleArchivePreview = async (
  link: LinksAndCollectionAndOwner,
  page: Page
) => {
  let ogImageUrl = await page.evaluate(() => {
    const metaTag = document.querySelector('meta[property="og:image"]');
    return metaTag ? (metaTag as any).content : null;
  });

  let previewGenerated = false;

  // TRY ADDED //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  try {
    if (ogImageUrl) {
      if (
        !ogImageUrl.startsWith("http://") &&
        !ogImageUrl.startsWith("https://")
      ) {
        const origin = await page.evaluate(() => document.location.origin);
        ogImageUrl =
          origin + (ogImageUrl.startsWith("/") ? ogImageUrl : "/" + ogImageUrl);
      }

      // the line that can fail and spit to docker logs/console //////////////////////////////////////////////////////////////////////////////
      const imageResponse = await page.goto(ogImageUrl);

      if (imageResponse && !link.preview?.startsWith("archive")) {
        const buffer = await imageResponse.body();
        previewGenerated = await generatePreview(
          buffer,
          link.collectionId,
          link.id
        );
      }

      await page.goBack();
    }
  } catch (error: any) {
    console.warn(`[Preview Handler] Failed to fetch og:image for link ${link.id}: ${error.name}. Falling back to screenshot.`);
    // Ensure we navigate back to the original page if the goto() failed
    await page.goto(link.url as string, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  // //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  // now fallback = above block fails or nothing happens
  if (!previewGenerated && !link.preview?.startsWith("archive")) {
    await page
      .screenshot({ type: "jpeg", quality: 20 })
      .then(async (screenshot) => {
        if (
          Buffer.byteLength(screenshot) >
          1024 * 1024 * Number(process.env.PREVIEW_MAX_BUFFER || 10)
        )
          return console.log("Error generating preview: Buffer size exceeded");

        await createFile({
          data: screenshot,
          filePath: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
        });

        await prisma.link.update({
          where: { id: link.id },
          data: {
            preview: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
          },
        });
      });
  }
};

export default handleArchivePreview;
