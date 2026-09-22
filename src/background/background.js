importScripts("../shared/message-contract.js", "background-config.js", "maps-client.js");

const { TYPES: MESSAGE_TYPES } = self.KORAIL_MESSAGE_CONTRACT;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !isKorailSender(sender)) return false;

  if (request.type === MESSAGE_TYPES.SUPPORT_SUBMIT) {
    handleSupportSubmit(request, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Feedback submission failed." }));
    return true;
  }

  if (request.type !== MESSAGE_TYPES.MAP_API_REQUEST) return false;

  handleApiRequest(request)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({
      ok: false,
      error: `Background fetch failed: ${error.message || "API request failed."}`,
      status: error.status,
    }));
  return true;
});

function handleApiRequest(request) {
  if (request.kind === "trainSchedule") return requestKorailTrainSchedule(request);
  return self.KORAIL_MAPS_CLIENT.request(request);
}

function isKorailSender(sender) {
  return /^https:\/\/(www\.)?korail\.com\//.test(sender.tab?.url || sender.url || "");
}

async function handleSupportSubmit(request, sender) {
  const endpoint = new URL(self.KORAIL_BACKGROUND_CONFIG?.supportFeedbackEndpoint || "");
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "formspree.io") {
    throw new Error("Invalid feedback endpoint.");
  }

  const senderPage = new URL(sender.tab?.url || sender.url || "");

  const payload = request.payload || {};
  const formData = new URLSearchParams({
    category: payload.category || "",
    message: payload.message || "",
    contact: payload.contact || "",
    pageUrl: `${senderPage.origin}${senderPage.pathname}`,
    locale: typeof payload.locale === "string" ? payload.locale.slice(0, 20) : "unknown",
  });
  const response = await fetch(endpoint.href, {
    method: "POST",
    headers: {
      "Accept": "application/json",
    },
    body: formData,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Feedback submission failed: ${response.status}`);
  return {
    accepted: true,
    status: response.status,
    response: data,
  };
}

async function requestKorailTrainSchedule(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://www.korail.com/classes/com.korail.mobile.trainsInfo.TrainSchedule", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({
        Device: "AD",
        Version: "999999999",
        txtRunDt: request.runDate,
        txtTrnNo: request.trainNo,
        txtTrnGpCd: request.trainGroupCode || "00",
      }),
    });
    const data = await response.json().catch(() => null);
    const timeInfo = data?.time_infos?.time_info;
    if (!response.ok || data?.h_msg_cd !== "IRZ000001" || !Array.isArray(timeInfo)) {
      const error = new Error(data?.h_msg_txt || `Train schedule HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return {
      runDate: request.runDate,
      trainNo: request.trainNo,
      stations: timeInfo
        .map((item) => item?.h_stop_rs_stn_nm || item?.h_stop_rs_stn_eng_nm || "")
        .filter(Boolean),
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Train schedule request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
