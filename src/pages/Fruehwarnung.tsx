import { Navigate } from "react-router-dom";

/**
 * Frühwarnung — Redesign 27.07.2026.
 *
 * Leons Entwurf kennt nur EINEN Ort für "was warnt": Signale & Gesundheit.
 * Die Seite ist deshalb mit /signale zusammengeführt und leitet dorthin —
 * in genau den Bereich, der vorher hier stand (Risk Shield + Compliance-Radar).
 *
 * Die Route bleibt bestehen, damit gespeicherte Links, die Cmd-K-Suche und der
 * Sidebar-Punkt weiter funktionieren. Es geht nichts verloren, es liegt nur
 * nicht mehr an zwei Stellen.
 */
export default function Fruehwarnung() {
  return <Navigate to="/signale?sec=risk_shield" replace />;
}
