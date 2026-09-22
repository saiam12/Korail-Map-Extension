// Train fare normalization and discount calculations.

function normalizeTrainFareEntries(entries) {
  const fares = {};
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const digits = String(entry?.sumAmt ?? "").replace(/\D/g, "");
    if (!digits) return;
    const amount = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
    const seatName = String(entry?.psrmClNm || "");
    if (/특실|우등|first|special/i.test(seatName)) {
      fares.special = amount;
    } else if (!fares.general) {
      fares.general = amount;
    }
  });
  return fares;
}

function getTrainFareCacheKey(metadata) {
  return [
    metadata.runDate,
    metadata.trainNo,
    metadata.departureStationCode,
    metadata.arrivalStationCode,
    metadata.seatAttributeCode,
  ].join(":");
}

function roundKorailTrainFare(amount) {
  const lowerHundred = Math.floor(amount / 100) * 100;
  return amount - lowerHundred > 50 ? lowerHundred + 100 : lowerHundred;
}

function calculateDiscountedTrainFare(amount, discountPercent) {
  const originalFare = Number(String(amount || "").replace(/\D/g, ""));
  if (!Number.isFinite(originalFare) || originalFare <= 0) return amount;
  const discountedFare = roundKorailTrainFare(
    originalFare * ((100 - discountPercent) / 100),
  );
  return String(discountedFare).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

function calculateStandingTrainFare(amount) {
  return calculateDiscountedTrainFare(amount, 15);
}

function calculateTransferTrainFare(amount, isStanding) {
  const standingFare = isStanding ? calculateStandingTrainFare(amount) : amount;
  return calculateDiscountedTrainFare(standingFare, 30);
}

window.KORAIL_BOOKING_FARE = {
  calculateDiscountedTrainFare,
  calculateStandingTrainFare,
  calculateTransferTrainFare,
  getTrainFareCacheKey,
  normalizeTrainFareEntries,
  roundKorailTrainFare,
};
