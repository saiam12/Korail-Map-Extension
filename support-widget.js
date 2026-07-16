// 모든 Korail 화면에서 사용하는 확장 프로그램 문의 창입니다.
(() => {
  if (document.getElementById("korail-support-launcher")) return;

  const isKorean = () => window.KORAIL_SHARED?.getKorailLocale?.() === "ko";
  const text = (ko, en) => isKorean() ? ko : en;
  const endpoint = () => window.KORAIL_MAP_CONFIG?.supportFeedbackEndpoint?.trim() || "";
  const officialCenterUrl = "https://info.korail.com/mbs/www/jsp/voc/explorer";
  const restaurantGuideUrls = {
    ko: "https://korean.visitkorea.or.kr/main/area_chart.do",
    en: "https://english.visitkorea.or.kr/svc/sp/food?menuSn=181",
    jpn: "https://japanese.visitkorea.or.kr/svc/sp/food?menuSn=181",
    chn: "https://chinese.visitkorea.or.kr/svc/sp/food?menuSn=181",
    tw: "https://big5chinese.visitkorea.or.kr/svc/sp/food?menuSn=181",
  };
  const restaurantGuideUrl = () => restaurantGuideUrls[window.KORAIL_SHARED?.getKorailLocale?.()] || restaurantGuideUrls.en;

  const launcher = document.createElement("button");
  launcher.id = "korail-support-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", text("안내", "Support"));
  launcher.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.75A3.75 3.75 0 0 1 8.75 2h6.5A3.75 3.75 0 0 1 19 5.75v5.5A3.75 3.75 0 0 1 15.25 15H12l-3.8 3.04A.75.75 0 0 1 7 17.45V15.6A3.75 3.75 0 0 1 5 12.25z" /></svg>`;
  document.body.appendChild(launcher);

  const modal = document.createElement("div");
  modal.id = "korail-support-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="korail-support-modal__backdrop"></div>
    <section class="korail-support-modal__dialog" role="dialog" aria-labelledby="korail-support-title">
      <header class="korail-support-modal__head">
        <h2 id="korail-support-title"></h2>
        <button type="button" class="korail-support-modal__close" aria-label="Close">×</button>
      </header>
      <div class="korail-support-choice">
        <p class="korail-support-choice__notice"></p>
        <button type="button" class="korail-support-choice__item" data-support-choice="inquiry"><strong></strong><span></span></button>
        <button type="button" class="korail-support-choice__item" data-support-choice="restaurant"><strong></strong><span></span></button>
      </div>
      <div class="korail-support-choice korail-support-inquiry" hidden>
        <button type="button" class="korail-support-back korail-support-inquiry__back"></button>
        <button type="button" class="korail-support-choice__item" data-support-choice="extension"><strong></strong><span></span></button>
        <button type="button" class="korail-support-choice__item" data-support-choice="korail"><strong></strong><span></span></button>
      </div>
      <div class="korail-support-feedback" hidden>
        <button type="button" class="korail-support-back korail-support-feedback__back"></button>
        <form class="korail-support-form">
          <p class="korail-support-form__notice"></p>
          <label><span data-support-field="category"></span><select name="category"><option value="bug"></option><option value="suggestion"></option><option value="usage"></option><option value="other"></option></select></label>
          <label><span data-support-field="message"></span><textarea name="message" required maxlength="4000"></textarea></label>
          <label><span data-support-field="contact"></span><input name="contact" type="text" maxlength="200"></label>
          <p class="korail-support-form__privacy"></p>
          <div class="korail-support-form__actions"><button type="button" class="korail-support-modal__cancel"></button><button type="submit" class="korail-support-form__submit"></button></div>
          <p class="korail-support-form__status" aria-live="polite"></p>
        </form>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const by = (selector) => modal.querySelector(selector);
  const choice = by(".korail-support-choice");
  const inquiry = by(".korail-support-inquiry");
  const feedback = by(".korail-support-feedback");
  const setLabels = () => {
    by("#korail-support-title").textContent = text("서비스 안내", "Support");
    by(".korail-support-choice__notice").textContent = text("에러코드가 표시되면 페이지가 자동으로 새로고침됩니다.", "The page refreshes automatically\nwhen an error code appears.");
    by("[data-support-choice='inquiry'] strong").textContent = text("문의", "Contact");
    by("[data-support-choice='inquiry'] span").textContent = text("확장 프로그램과 코레일 관련 문의", "Extension and KORAIL inquiries");
    by("[data-support-choice='extension'] strong").textContent = text("확장 프로그램 문의", "Extension feedback");
    by("[data-support-choice='extension'] span").textContent = text("지도 기능, 오류, 개선 제안", "Map features, bugs, and suggestions");
    by("[data-support-choice='korail'] strong").textContent = text("코레일 관련 문의", "KORAIL customer service");
    by("[data-support-choice='korail'] span").textContent = text("지연, 환불, 승차권, 운행 문의", "Delays, refunds, tickets, and service questions");
    by("[data-support-choice='restaurant'] strong").textContent = text("맛집 추천", "Restaurant recommendations");
    by("[data-support-choice='restaurant'] span").textContent = text("지역별 맛집과 여행 정보", "Regional restaurants and travel information");
    by(".korail-support-inquiry__back").textContent = text("← 처음으로", "← Back");
    by(".korail-support-feedback__back").textContent = text("← 문의 유형 선택", "← Choose support type");
    by("[data-support-field='category']").textContent = text("문의 유형", "Category");
    by("[data-support-field='message']").textContent = text("문의 내용 *", "Message *");
    by("[data-support-field='contact']").textContent = text("회신 연락처 (선택)", "Reply contact (optional)");
    const options = by("select[name='category']").options;
    [text("오류 신고", "Bug report"), text("기능 제안", "Feature request"), text("사용 방법", "How to use"), text("기타", "Other")].forEach((label, index) => { options[index].text = label; });
    by("textarea").placeholder = text("문제 상황이나 제안 내용을 자세히 적어주세요.", "Describe the problem or suggestion in detail.");
    by("input[name='contact']").placeholder = text("이메일, 카카오톡 ID 등", "Email or another contact method");
    by(".korail-support-form__privacy").textContent = text("확장 프로그램에 관한 내용만 남겨주세요.", "Please send questions about this extension only.");
    by(".korail-support-modal__cancel").textContent = text("취소", "Cancel");
    by(".korail-support-form__submit").textContent = text("문의 제출", "Send feedback");
  };

  const showChoices = () => { choice.hidden = false; inquiry.hidden = true; feedback.hidden = true; };
  const showInquiry = () => { choice.hidden = true; inquiry.hidden = false; feedback.hidden = true; };
  const close = () => { modal.hidden = true; showChoices(); };
  const open = () => { setLabels(); by(".korail-support-form__status").textContent = ""; showChoices(); modal.hidden = false; };
  launcher.addEventListener("click", () => {
    if (modal.hidden) open();
    else close();
  });
  by(".korail-support-modal__close").addEventListener("click", close);
  by(".korail-support-modal__cancel").addEventListener("click", close);
  by(".korail-support-modal__backdrop").addEventListener("click", close);
  by(".korail-support-feedback__back").addEventListener("click", showInquiry);
  by(".korail-support-inquiry__back").addEventListener("click", showChoices);
  by("[data-support-choice='inquiry']").addEventListener("click", showInquiry);
  by("[data-support-choice='extension']").addEventListener("click", () => { inquiry.hidden = true; feedback.hidden = false; by("textarea").focus(); });
  by("[data-support-choice='korail']").addEventListener("click", () => window.open(officialCenterUrl, "_blank", "noopener"));
  by("[data-support-choice='restaurant']").addEventListener("click", () => window.open(restaurantGuideUrl(), "_blank", "noopener"));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) close(); });

  function submitToBackground(payload) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener("message", handler); reject(new Error("timeout")); }, 15000);
      const handler = (event) => {
        if (event.source !== window || event.data?.type !== "KORAIL_SUPPORT_RESPONSE" || event.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        event.data.ok ? resolve() : reject(new Error(event.data.error || "submit failed"));
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "KORAIL_SUPPORT_SUBMIT", requestId, endpoint: endpoint(), payload }, "*");
    });
  }

  by(".korail-support-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = by(".korail-support-form__status");
    if (!endpoint()) {
      status.textContent = text("문의 수신 주소가 아직 연결되지 않았습니다.", "The feedback endpoint has not been configured yet.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const submit = by(".korail-support-form__submit");
    submit.disabled = true;
    status.textContent = text("전송 중…", "Sending…");
    try {
      await submitToBackground({ category: form.get("category"), message: form.get("message"), contact: form.get("contact"), pageUrl: location.href, locale: window.KORAIL_SHARED?.getKorailLocale?.() || "unknown" });
      event.currentTarget.reset();
      status.textContent = text("문의가 전달되었습니다. 감사합니다.", "Your feedback has been sent. Thank you.");
    } catch {
      status.textContent = text("전송에 실패했습니다. 잠시 후 다시 시도해주세요.", "Sending failed. Please try again later.");
    } finally {
      submit.disabled = false;
    }
  });

  const errorCodePattern = /\bCODE\s*:\s*-\d+/i;
  let errorReloadScheduled = false;

  const reloadOnErrorCode = () => {
    if (errorReloadScheduled) return;
    const dialogs = document.querySelectorAll(".ReactModal__Content, [role='dialog'], .layerWrap, .modal, .popup");
    const hasErrorCode = [...dialogs].some((dialog) => errorCodePattern.test(dialog.textContent || ""));
    if (!hasErrorCode) return;

    errorReloadScheduled = true;
    const randomNumber = Math.floor(Math.random() * 101) + 100;
    setTimeout(() => location.reload(), Math.random(randomNumber));//100-200ms 지연 후 새로고침
  };

  let errorDialogScanFrame = null;
  const errorDialogObserver = new MutationObserver(() => {
    if (errorDialogScanFrame !== null) return;
    errorDialogScanFrame = requestAnimationFrame(() => {
      errorDialogScanFrame = null;
      reloadOnErrorCode();
    });
  });
  errorDialogObserver.observe(document.body, { childList: true, subtree: true });
  reloadOnErrorCode();
})();
