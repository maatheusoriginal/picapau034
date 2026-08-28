import ReactDOM from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado.");

ReactDOM.createRoot(root).render(<Home />);
