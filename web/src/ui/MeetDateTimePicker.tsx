import React, { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { formatMeetDateLong } from "./createCircleSchedule";
import { formatHourOnlyDisplay } from "./HourOnlyPicker";
import {
  buildMonthGrid,
  calendarDowLabels,
  defaultMeetDateIso,
  monthLabel,
  parseIsoDate,
} from "./calendarMonth";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourOption(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function ClockFace(props: { hour: number }) {
  const h12 = props.hour % 12;
  const rotation = h12 * 30;

  return (
    <div className="meet-dt-clock" aria-hidden>
      <svg viewBox="0 0 120 120" className="meet-dt-clock-svg">
        <circle cx="60" cy="60" r="54" className="meet-dt-clock-ring" />
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const x = 60 + Math.cos(angle) * 44;
          const y = 60 + Math.sin(angle) * 44;
          const label = i === 0 ? 12 : i;
          return (
            <text key={i} x={x} y={y} className="meet-dt-clock-tick" textAnchor="middle" dominantBaseline="middle">
              {label}
            </text>
          );
        })}
        <line
          x1="60"
          y1="60"
          x2="60"
          y2="28"
          className="meet-dt-clock-hand"
          transform={`rotate(${rotation} 60 60)`}
        />
        <circle cx="60" cy="60" r="3" className="meet-dt-clock-hub" />
      </svg>
      <div className="meet-dt-clock-center">{formatHourOption(props.hour)}</div>
    </div>
  );
}

export function MeetDateTimePicker(props: {
  dateValue: string;
  hourValue: string;
  minDate: string;
  onDateChange: (value: string) => void;
  onHourChange: (hour: string) => void;
  disabled?: boolean;
  dateId?: string;
}) {
  const { i18n } = useTranslation();
  const baseId = useId().replace(/:/g, "");
  const triggerId = props.dateId ?? `meet-dt-${baseId}`;
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(props.dateValue);
  const [draftHour, setDraftHour] = useState(props.hourValue);

  const parsed = parseIsoDate(draftDate) ?? parseIsoDate(defaultMeetDateIso())!;
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.monthIndex);

  const selectedHour = Math.min(23, Math.max(0, parseInt(draftHour, 10) || 0));
  const grid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, draftDate, props.minDate),
    [viewYear, viewMonth, draftDate, props.minDate],
  );
  const dowLabels = useMemo(() => calendarDowLabels(), [i18n.language]);

  const summaryLine = `${formatMeetDateLong(draftDate)} · ${formatHourOnlyDisplay(String(selectedHour))}`;

  function openPopup() {
    if (props.disabled) return;
    setDraftDate(props.dateValue);
    setDraftHour(props.hourValue);
    const p = parseIsoDate(props.dateValue);
    if (p) {
      setViewYear(p.year);
      setViewMonth(p.monthIndex);
    }
    setOpen(true);
  }

  function closePopup() {
    setOpen(false);
  }

  function confirm() {
    props.onDateChange(draftDate);
    props.onHourChange(String(selectedHour));
    closePopup();
  }

  function clearDraft() {
    const d = defaultMeetDateIso();
    setDraftDate(d);
    setDraftHour("17");
    const p = parseIsoDate(d);
    if (p) {
      setViewYear(p.year);
      setViewMonth(p.monthIndex);
    }
  }

  function prevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function nextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePopup();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const triggerLabel = `${formatMeetDateLong(props.dateValue)} · ${formatHourOnlyDisplay(props.hourValue)}`;

  return (
    <>
      <button
        type="button"
        id={triggerId}
        className="meet-dt-trigger create-circle-input"
        disabled={props.disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPopup}
      >
        <span className="meet-dt-trigger-icon" aria-hidden>
          📅
        </span>
        <span className="meet-dt-trigger-text">{triggerLabel}</span>
        <span className="meet-dt-trigger-chevron muted" aria-hidden>
          ▾
        </span>
      </button>

      {open
        ? createPortal(
            <div className="meet-dt-overlay" role="presentation" onClick={closePopup}>
              <div
                className="meet-dt-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${triggerId}-title`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="meet-dt-dialog-header">
                  <div className="meet-dt-dialog-title-row">
                    <span className="meet-dt-dialog-icon" aria-hidden>
                      📅
                    </span>
                    <h3 id={`${triggerId}-title`} className="meet-dt-dialog-title">
                      Date and time
                    </h3>
                    <button type="button" className="icon-btn meet-dt-close" aria-label="Close" onClick={closePopup}>
                      ×
                    </button>
                  </div>
                  <p className="meet-dt-dialog-summary">{summaryLine}</p>
                </div>

                <div className="meet-dt-dialog-body">
                  <div className="meet-dt-calendar-pane">
                    <div className="meet-dt-month-nav row">
                      <button
                        type="button"
                        className="icon-btn meet-dt-month-btn"
                        aria-label="Previous month"
                        onClick={prevMonth}
                      >
                        ‹
                      </button>
                      <div className="meet-dt-month-label">{monthLabel(viewYear, viewMonth)}</div>
                      <button
                        type="button"
                        className="icon-btn meet-dt-month-btn"
                        aria-label="Next month"
                        onClick={nextMonth}
                      >
                        ›
                      </button>
                    </div>
                    <div className="meet-dt-weekdays" aria-hidden>
                      {dowLabels.map((d, i) => (
                        <span key={`${d}-${i}`} className="meet-dt-weekday">
                          {d}
                        </span>
                      ))}
                    </div>
                    <div className="meet-dt-days" role="grid" aria-label="Calendar">
                      {grid.map((cell) => (
                        <button
                          key={cell.iso}
                          type="button"
                          role="gridcell"
                          disabled={cell.disabled}
                          className={[
                            "meet-dt-day",
                            !cell.inMonth ? "is-outside" : "",
                            cell.isToday ? "is-today" : "",
                            cell.isSelected ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-selected={cell.isSelected}
                          aria-label={cell.iso}
                          onClick={() => setDraftDate(cell.iso)}
                        >
                          {cell.day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="meet-dt-time-pane stack">
                    <ClockFace hour={selectedHour} />
                    <label className="meet-dt-hour-select stack">
                      <span className="create-circle-label">Time</span>
                      <select
                        className="create-circle-input"
                        value={String(selectedHour)}
                        aria-label="Hour"
                        onChange={(e) => setDraftHour(e.target.value)}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={String(h)}>
                            {formatHourOption(h)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="meet-dt-dialog-footer row">
                  <button type="button" className="meet-dt-footer-btn primary" onClick={confirm}>
                    Apply
                  </button>
                  <button type="button" className="meet-dt-footer-btn" onClick={clearDraft}>
                    Clear
                  </button>
                  <button type="button" className="meet-dt-footer-btn" onClick={closePopup}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
