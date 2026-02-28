import React from "react";
import ReactDOM from "react-dom/client";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import App from "./App";
import "./index.css";

const MODULE_ADDRESS = import.meta.env.VITE_MODULE_ADDRESS || "0x2";
const NET = import.meta.env.VITE_NETWORK || "TESTNET";
const NETWORK =
  NET === "MAINNET" ? Network.MAINNET : NET === "DEVNET" ? Network.DEVNET : Network.TESTNET;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AptosWalletAdapterProvider
      autoConnect
      dappConfig={{ network: NETWORK }}
      optInWallets={["Petra", "Martian", "Fewcha"]}
    >
      <App moduleAddress={MODULE_ADDRESS} network={NETWORK} />
    </AptosWalletAdapterProvider>
  </React.StrictMode>
);
