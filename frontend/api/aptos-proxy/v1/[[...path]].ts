const APTOS_DEVNET = "https://api.devnet.aptoslabs.com/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  const path = (req.query.path as string[] | undefined)?.join("/") ?? "";
  const url = path ? `${APTOS_DEVNET}/${path}` : APTOS_DEVNET;

  try {
    const init: RequestInit = {
      method: req.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers["content-type"] && { "Content-Type": req.headers["content-type"] as string }),
      },
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(url, init);
    const data = await response.text();
    res
      .status(response.status)
      .setHeader("Content-Type", response.headers.get("content-type") || "application/json")
      .send(data);
  } catch (err) {
    console.error("Aptos proxy error:", err);
    res.status(502).json({ error: "Proxy request failed" });
  }
}
