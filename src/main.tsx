import ReactDOM from "react-dom/client";
import Home from "../app/page";
import { ErrorBoundary } from "../app/ErrorBoundary";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado.");

// A rede de segurança mais externa: sem ela, uma exceção em qualquer lugar
// deixa a pessoa olhando para uma tela branca sem explicação nem saída.
ReactDOM.createRoot(root).render(
  <ErrorBoundary area="aplicação">
    <Home />
  </ErrorBoundary>,
);
