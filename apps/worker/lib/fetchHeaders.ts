import fetch from "node-fetch";
import https from "https";
import http from "http";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from "socks-proxy-agent";

export default async function fetchHeaders(url: string) {
  if (process.env.IGNORE_URL_SIZE_LIMIT === "true") return null;

  try {
    const httpsAgent = url.startsWith("http://")
      ? new http.Agent({})
      : new https.Agent({
          rejectUnauthorized:
            process.env.IGNORE_UNAUTHORIZED_CA === "true" ? false : true,
        });

    let fetchOpts: { method: string; agent: any } = { // Added type for clarity
      method: "HEAD",
      agent: httpsAgent,
    };

    if (process.env.PROXY) {
      let proxy = new URL(process.env.PROXY);
      if (process.env.PROXY_USERNAME) {
        proxy.username = process.env.PROXY_USERNAME;
        proxy.password = process.env.PROXY_PASSWORD || "";
      }

      const proxyAgent = proxy.protocol.includes("http") ? HttpsProxyAgent : SocksProxyAgent;

      fetchOpts = {
        method: "HEAD",
        agent: new proxyAgent(proxy.toString()),
      };
    }

    const responsePromise = fetch(url, fetchOpts as any); // Use 'as any' to satisfy fetch types

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Fetch header timeout"));
      }, 10 * 1000); // Stop after 10 seconds
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    return (response as Response)?.headers || null;
  } catch (err: any) { // ////////////////////////////////////////////////// CATCH BLOCK MODIFIED HERE
    // protocol error without crashing
    if (err.code === 'ERR_INVALID_PROTOCOL') {
      console.warn(`[Fetch Headers] Skipped insecure http:// resource: ${url}`);
      return null;
    }
    
    // other errors remain same
    console.log(`[Fetch Headers] Error for ${url}:`, err.name);
    return null;
  }
}
