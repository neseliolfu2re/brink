import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import type { EntryFunctionABI } from "@aptos-labs/ts-sdk";
import { useEffect, useState, useCallback, useMemo } from "react";

const APT_DECIMALS = 1e8;

// Static ABI — chain'den çekmeyi atla (module ABI hatası bypass)
const CLICK_ABI: EntryFunctionABI = { typeParameters: [], parameters: [] };
const CLAIM_ABI: EntryFunctionABI = { typeParameters: [], parameters: [] };

type GameState = {
  fee: string;
  pool: string;
  roundId: string;
  timeRemaining: number;
  treasury: string;
  roundActive: boolean;
};

type ChainEvent = {
  type: string;
  data: { clicker?: string; winner?: string; admin?: string; fee_octas?: string; amount_octas?: string; round_id?: string };
};

function formatApt(octas: string | number): string {
  const n = typeof octas === "string" ? Number(octas) : octas;
  return (n / APT_DECIMALS).toFixed(4);
}

function formatAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const fullFn = (m: string, f: string) =>
  `${m}::last_click_wins::${f}` as `${string}::${string}::${string}`;

export default function App({
  moduleAddress,
  network,
}: {
  moduleAddress: string;
  network: import("@aptos-labs/ts-sdk").Network;
}) {
  const { account, connect, disconnect, connected, wallets, signTransaction, network: walletNetwork } = useWallet();
  const [state, setState] = useState<GameState | null>(null);
  const [displayTime, setDisplayTime] = useState<number>(0);
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullnode =
    typeof window !== "undefined" && window.location.hostname !== "localhost"
      ? `${window.location.origin}/api/aptos-proxy/v1`
      : undefined;
  const aptosConfig = useMemo(() => new AptosConfig({ network, fullnode }), [network, fullnode]);
  const aptos = useMemo(() => new Aptos(aptosConfig), [aptosConfig]);

  const fetchState = useCallback(async () => {
    if (!moduleAddress) return;
    setLoading(true);
    setError(null);
    try {
      const [fee, pool, roundId, timeRemaining, treasury] = await Promise.all([
        aptos.view({ payload: { function: fullFn(moduleAddress, "get_current_fee"), functionArguments: [] } }),
        aptos.view({ payload: { function: fullFn(moduleAddress, "get_pool_amount"), functionArguments: [] } }),
        aptos.view({ payload: { function: fullFn(moduleAddress, "get_round_id"), functionArguments: [] } }),
        aptos.view({ payload: { function: fullFn(moduleAddress, "get_time_remaining"), functionArguments: [] } }),
        aptos.view({ payload: { function: fullFn(moduleAddress, "get_treasury_amount"), functionArguments: [] } }),
      ]);
      const tr = Number(timeRemaining[0]);
      let roundActive = true;
      try {
        const [ra] = await aptos.view({ payload: { function: fullFn(moduleAddress, "get_round_active"), functionArguments: [] } });
        roundActive = Boolean(ra);
      } catch {
        roundActive = Number(pool[0]) > 0 || tr < 300;
      }
      setState({
        fee: String(fee[0]),
        pool: String(pool[0]),
        roundId: String(roundId[0]),
        timeRemaining: tr,
        treasury: String(treasury[0]),
        roundActive,
      });
      setDisplayTime(tr);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [moduleAddress, aptos]);

  const fetchEvents = useCallback(async () => {
    if (!moduleAddress) return;
    try {
      const evs = await aptos.getAccountEventsByEventType({
        accountAddress: moduleAddress,
        eventType: `${moduleAddress}::last_click_wins::ClickEvent`,
        options: { limit: 5, orderBy: [{ creation_number: "desc" }] },
      });
      const parsed: ChainEvent[] = (evs as unknown[]).map((e: { data?: object }) => ({
        type: "Click",
        data: (e.data || {}) as ChainEvent["data"],
      }));
      try {
        const claimEvs = await aptos.getAccountEventsByEventType({
          accountAddress: moduleAddress,
          eventType: `${moduleAddress}::last_click_wins::ClaimEvent`,
          options: { limit: 3, orderBy: [{ creation_number: "desc" }] },
        });
        (claimEvs as unknown[]).forEach((e: { data?: object }) =>
          parsed.push({ type: "Claim", data: (e.data || {}) as ChainEvent["data"] })
        );
      } catch {
        /* claims may not exist yet */
      }
      setEvents(parsed.slice(0, 8));
    } catch {
      setEvents([]);
    }
  }, [moduleAddress, aptos]);

  useEffect(() => {
    fetchState();
    fetchEvents();
    const id = setInterval(fetchState, 5000);
    const evId = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(id);
      clearInterval(evId);
    };
  }, [fetchState, fetchEvents]);

  useEffect(() => {
    if (displayTime <= 0) return;
    const t = setInterval(() => setDisplayTime((d) => (d > 0 ? d - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [displayTime]);

  const submitTx = async (fn: string) => {
    if (!account || !signTransaction) return;
    setTxPending(true);
    setError(null);
    try {
      const abi = fn === "click" ? CLICK_ABI : CLAIM_ABI;
      const rawTxn = await aptos.transaction.build.simple({
        sender: account.address,
        data: {
          function: fullFn(moduleAddress, fn),
          typeArguments: [],
          functionArguments: [],
          abi,
        },
      });
      const { authenticator } = await signTransaction({ transactionOrPayload: rawTxn });
      const res = await aptos.transaction.submit.simple({
        transaction: rawTxn,
        senderAuthenticator: authenticator,
      });
      await aptos.waitForTransaction({ transactionHash: res.hash });
      await fetchState();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("module ABI") ? "Petra'da Network → Devnet seçili mi? Modül sadece Devnet'te yayınlı." : msg);
    } finally {
      setTxPending(false);
    }
  };

  const handleClick = () => submitTx("click");
  const handleClaim = () => submitTx("claim_if_timeout");

  return (
    <>
      {connected && walletNetwork && (walletNetwork.chainId === "1" || walletNetwork.chainId === "2") && (
        <div className="card" style={{ background: "#7f1d1d", borderColor: "#ef444433" }}>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#fecaca" }}>
            ⚠️ <strong>Petra Devnet&apos;te olmalı!</strong> Settings → Network → Devnet seç. 
            Modül sadece Devnet&apos;te; Mainnet/Testnet&apos;te &quot;module ABI&quot; hatası alırsın.
          </p>
        </div>
      )}
      <div className="card" style={{ background: "#1e3a2f", borderColor: "#22c55e33" }}>
        <p style={{ margin: 0, fontSize: "0.8rem", color: "#86efac" }}>
          Sözleşme Devnet&apos;te. Wallet&apos;ta <strong>Network → Devnet</strong> seç. 
          Petra ABI hatası verirse <strong>Martian</strong> veya <strong>Fewcha</strong> dene.
        </p>
      </div>
      <div className="card">
        <h1>Last Click Wins</h1>
        {!connected ? (
          <div>
            <p style={{ marginBottom: "1rem", color: "#a1a1aa" }}>
              Connect your wallet to play.
            </p>
            {wallets.map((w) => (
              <button
                key={w.name}
                onClick={() => connect(w.name)}
                style={{ marginRight: "0.5rem" }}
              >
                Connect {w.name}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: "0.8rem", color: "#71717a", marginBottom: "1rem" }}>
              {account?.address.toString().slice(0, 6)}...
              {account?.address.toString().slice(-4)}{" "}
              <button className="btn-outline" onClick={disconnect} style={{ marginLeft: "0.5rem" }}>
                Disconnect
              </button>
            </p>
            {loading && !state ? (
              <p>Loading…</p>
            ) : state ? (
              <>
                <div className="stat">Current fee</div>
                <div className="stat-value">{formatApt(state.fee)} APT</div>
                <div className="stat">Pool</div>
                <div className="stat-value">{formatApt(state.pool)} APT</div>
                <div className="stat">Round #{state.roundId}</div>
                <div className="stat">Time until claimable</div>
                <div className="stat-value stat-ticking">
                  {!state.roundActive
                    ? "Waiting for first click"
                    : displayTime > 0
                    ? `${Math.floor(displayTime / 60)}:${String(displayTime % 60).padStart(2, "0")}`
                    : "Now"}
                </div>
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <button onClick={handleClick} disabled={txPending}>
                    Click ({formatApt(state.fee)} APT)
                  </button>
                  <button
                    className="btn-outline"
                    onClick={handleClaim}
                    disabled={txPending || displayTime > 0 || !state.roundActive}
                  >
                    Claim
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
        {error && (
          <p style={{ color: "#f87171", fontSize: "0.875rem", marginTop: "1rem" }}>
            {error}
          </p>
        )}
      </div>
      {events.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem" }}>Recent activity</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem", color: "#a1a1aa" }}>
            {events.slice(0, 5).map((e, i) => (
              <li key={i} style={{ padding: "0.25rem 0", borderBottom: "1px solid #27272a" }}>
                {e.type === "Click" && (
                  <>Click by {formatAddr(String(e.data?.clicker ?? ""))} — +{formatApt(e.data?.fee_octas ?? 0)} APT → pool</>
                )}
                {e.type === "Claim" && (
                  <>Claim by {formatAddr(String(e.data?.winner ?? ""))} — {formatApt(e.data?.amount_octas ?? 0)} APT</>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p style={{ fontSize: "0.75rem", color: "#71717a" }}>
        Module: {moduleAddress}
      </p>
    </>
  );
}
