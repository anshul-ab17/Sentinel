"use client";

import { Icon } from "@app/components/icon";

import { time } from "./format.ts";

import type { Snapshot } from "@shared/snapshot";
import type { Alert } from "@shared/events";

type AlertProps = {
  filteredAlerts: Alert[];
  severity: string;
  setSeverity: (value: string) => void;
  selectedAlert: string | null;
  setSelectedAlert: (id: string) => void;
};
type EvidenceProps = {
  snapshot: Snapshot;
  alert: Alert | undefined;
  savedIds: string[];
  toggleSaved: (id: string) => Promise<void>;
  exportReport: () => void;
};

type InvestigationProps = AlertProps & EvidenceProps;

export function InvestigationPanels(props: InvestigationProps) {
  return (
    <div className="investigation-grid">
      <div>
        <AlertsPanel
          filteredAlerts={props.filteredAlerts}
          severity={props.severity}
          setSeverity={props.setSeverity}
          selectedAlert={props.selectedAlert}
          setSelectedAlert={props.setSelectedAlert}
        />
      </div>
      <EvidencePanel
        snapshot={props.snapshot}
        alert={props.alert}
        savedIds={props.savedIds}
        toggleSaved={props.toggleSaved}
        exportReport={props.exportReport}
      />
    </div>
  );
}

export function AlertsPanel({
  filteredAlerts,
  severity,
  setSeverity,
  selectedAlert,
  setSelectedAlert,
}: AlertProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">DETECTION ENGINE</span>
          <h2>Signals to investigate</h2>
        </div>
        <select
          aria-label="Filter alerts by severity"
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        >
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>
      </div>
      <div className="alert-list">
        {filteredAlerts.map((alert) => (
          <button
            key={alert.id}
            className={`alert-row ${selectedAlert === alert.id ? "selected" : ""}`}
            onClick={() => setSelectedAlert(alert.id)}
          >
            <span className={`signal-icon ${alert.severity}`}>!</span>
            <span className="alert-copy">
              <strong>{alert.title}</strong>
              <span>
                {alert.pool} · rule v{alert.rule.version}
              </span>
            </span>
            <span className={`badge ${alert.severity === "high" ? "amber" : "neutral"}`}>
              {alert.severity}
            </span>
            <span className="arrow">↗</span>
          </button>
        ))}
        {!filteredAlerts.length && <p className="empty">No alerts match your filters.</p>}
      </div>
    </section>
  );
}

export function EvidencePanel({
  snapshot,
  alert,
  savedIds,
  toggleSaved,
  exportReport,
}: EvidenceProps) {
  return (
    <section className="panel evidence">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EVIDENCE FIRST</span>
          <h2>Investigation brief</h2>
        </div>
        <span className="mini-icon">⌕</span>
      </div>
      {alert ? (
        <div className="evidence-body">
          <div className="brief-title">
            <span className="badge amber">Requires investigation</span>
            <h3>{alert.title}</h3>
          </div>
          <span className="eyebrow">OBSERVATION</span>
          <p>{alert.observation}</p>
          <span className="eyebrow">HEURISTIC INTERPRETATION</span>
          <p>{alert.interpretation}</p>
          <div className="note">Template summary · No AI model connected</div>
          <div className="evidence-meta">
            <span>Rule version</span>
            <code>{alert.rule.version}</code>
            <span>Evidence records</span>
            <strong>{alert.evidence.length}</strong>
          </div>
          <details>
            <summary>Inspect transaction evidence</summary>
            <ul className="evidence-list">
              {snapshot.events
                .filter((event) => alert.evidence.includes(event.id))
                .map((event) => (
                  <li key={event.id}>
                    <strong>{event.kind}</strong>
                    <code>{event.signature}</code>
                    <span>
                      {time(event.timestamp)} UTC · slot {event.slot}
                    </span>
                  </li>
                ))}
            </ul>
          </details>
          <button className="secondary full" onClick={() => toggleSaved(alert.id)}>
            <Icon name="bookmark" size={15} />
            {savedIds.includes(alert.id) ? "Unsave investigation" : "Save investigation"}
          </button>
          <button className="secondary full" onClick={exportReport}>
            Export evidence JSON ↓
          </button>
          <p className="fine-print">
            {snapshot.coverage.mode === "fixture"
              ? "Fixture signatures cannot be verified on a blockchain explorer. "
              : "Only covered finalized evidence is included. "}
            Shared funding alone does not prove coordination.
          </p>
        </div>
      ) : (
        <p className="empty">Select an alert to inspect its evidence.</p>
      )}
    </section>
  );
}
