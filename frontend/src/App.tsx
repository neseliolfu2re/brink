import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Aptos, AptosConfig } from "@aptos-labs/ts-sdk";
import { useEffect, useState } from "react";

const APT_DECIMALS = 1e8;

type GameState = {
  fee: string;
  pool: string;
  roundId: string;
  timeRemaining: number;
  treasury: string;
};

function formatApt(octas: string | number): string {
  const n = typeof octas === "string" ? Number(octas) : octas;
  return (n / APT_DECIMALS).toFixed(4);
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
  const { account, connect, disconnect, connected, wallets, signAndSubmitTransaction } = useWallet();
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aptosConfig = new AptosConfig({ network });
  const aptos = new Aptos(aptosConfig);

  const fetchState = async () => {
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
      setState({
        fee: String(fee[0]),
        pool: String(pool[0]),
        roundId: String(roundId[0]),
        timeRemaining: Number(timeRemaining[0]),
        treasury: String(treasury[0]),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [moduleAddress]);

  const handleClick = async () => {
    if (!account || !connected || !signAndSubmitTransaction) return;
    setTxPending(true);
    setError(null);
    try {
      const { hash } = await signAndSubmitTransaction({
        data: {
          function: fullFn(moduleAddress, "click"),
          typeArguments: [],
          functionArguments: [],
        },
      });
      await aptos.waitForTransaction({ transactionHash: hash });
      await fetchState();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTxPending(false);
    }
  };

  const handleClaim = async () => {
    if (!account || !connected || !signAndSubmitTransaction) return;
    setTxPending(true);
    setError(null);
    try {
      const { hash } = await signAndSubmitTransaction({
        data: {
          function: fullFn(moduleAddress, "claim_if_timeout"),
          typeArguments: [],
          functionArguments: [],
        },
      });
      await aptos.waitForTransaction({ transactionHash: hash });
      await fetchState();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTxPending(false);
    }
  };

  return (
    <>
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
                <div className="stat-value">
                  {state.timeRemaining > 0
                    ? `${Math.floor(state.timeRemaining / 60)}:${String(state.timeRemaining % 60).padStart(2, "0")}`
                    : "Now"}
                </div>
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <button onClick={handleClick} disabled={txPending}>
                    Click ({formatApt(state.fee)} APT)
                  </button>
                  <button
                    className="btn-outline"
                    onClick={handleClaim}
                    disabled={txPending || state.timeRemaining > 0}
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
      <p style={{ fontSize: "0.75rem", color: "#71717a" }}>
        Module: {moduleAddress}
      </p>
    </>
  );
}
