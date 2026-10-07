import React from "react";
import { useTranslation } from "react-i18next";
import type { CircleResponse } from "../api/types";
import {
  formatCircleCostChip,
  formatCircleLocationShort,
  formatCircleScheduleChip,
} from "./circleDetailsFormat";
import { formatGroupSizeSummary } from "./groupSize";

export function CircleDetailsInformation(props: { circle: CircleResponse }) {
  const { t } = useTranslation();
  const { circle } = props;
  const capacity = circle.groupSize
    ? formatGroupSizeSummary(circle.groupSize, t)
    : t("circleDetails.upToPeople", { count: circle.maxSize });
  const rows = [
    {
      icon: "↻",
      label: t("circleDetails.rhythm"),
      value: circle.isRecurring === false
        ? t("circleDetails.factOneTime")
        : formatCircleScheduleChip(circle, t),
    },
    {
      icon: circle.modality === "online" ? "⌁" : "⌖",
      label: t("circleDetails.format"),
      value: circle.modality === "online"
        ? t("circleDetails.online")
        : formatCircleLocationShort(circle, t),
    },
    { icon: "♙", label: t("circleDetails.groupSize"), value: capacity },
    {
      icon: "◌",
      label: t("circleDetails.cost"),
      value: formatCircleCostChip(circle.costPayment, circle.groupSize, t),
    },
    {
      icon: "◇",
      label: t("circleDetails.access"),
      value: circle.inviteOnly
        ? t("circleDetails.inviteOnly")
        : t("circleDetails.openCircle"),
    },
  ];

  return (
    <section className="circle-details-information" aria-labelledby="circle-information-title">
      <div className="circle-details-section-head">
        <div>
          <p className="circle-details-section-kicker">{t("circleDetails.circleBasics")}</p>
          <h2 id="circle-information-title">{t("circleDetails.information")}</h2>
        </div>
      </div>
      <dl className="circle-details-info-list">
        {rows.map((row) => (
          <div key={row.label}>
            <span className="circle-details-info-icon" aria-hidden>{row.icon}</span>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
