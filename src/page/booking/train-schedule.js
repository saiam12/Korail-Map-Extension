// Train schedule metadata normalization shared by the booking controller.

function normalizeTrainRunDate(value) {
  const text = String(value || "");
  const compact = text.match(/20\d{6}/)?.[0];
  if (compact) return compact;
  const separated = text.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!separated) return "";
  return `${separated[1]}${separated[2].padStart(2, "0")}${separated[3].padStart(2, "0")}`;
}

function normalizeTrainNumber(value) {
  const trainNo = String(value || "").trim();
  if (!/^\d{1,6}$/.test(trainNo)) return "";
  return trainNo.replace(/^0+(?=\d)/, "");
}

function normalizeTrainScheduleMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const trainNo = normalizeTrainNumber(value.h_trn_no ?? value.trnNo ?? value.txtTrnNo ?? "");
  if (!trainNo) return null;
  return {
    trainNo,
    runDate: normalizeTrainRunDate(
      value.h_run_dt ?? value.runDt ?? value.txtRunDt ?? value.h_dpt_dt ?? value.dptDt,
    ),
    trainGroupCode: String(
      value.h_trn_gp_cd ?? value.trnGpCd ?? value.txtTrnGpCd ?? value.h_trn_clsf_cd ?? "00",
    ).replace(/\D/g, "").slice(0, 6) || "00",
  };
}

window.KORAIL_BOOKING_SCHEDULE = {
  normalizeTrainNumber,
  normalizeTrainRunDate,
  normalizeTrainScheduleMetadata,
};
