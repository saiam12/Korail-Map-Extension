// 모든 Korail 화면에서 사용하는 확장 프로그램 문의 창입니다.
(() => {
  if (document.getElementById("korail-support-launcher")) return;

  const isKorean = () => window.KORAIL_SHARED?.getKorailLocale?.() === "ko";
  const text = (ko, en) => isKorean() ? ko : en;
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
        <button type="button" class="korail-support-choice__item" data-support-choice="nearest"><strong></strong><span></span></button>
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
          <label><span data-support-field="category"></span><select name="category"><option value="bug"></option><option value="suggestion"></option><option value="other"></option></select></label>
          <label><span data-support-field="message"></span><textarea name="message" required maxlength="4000"></textarea></label>
          <label><span data-support-field="contact"></span><input name="contact" type="text" maxlength="200"></label>
          <p class="korail-support-form__privacy"></p>
          <div class="korail-support-form__actions"><button type="button" class="korail-support-modal__cancel"></button><button type="submit" class="korail-support-form__submit"></button></div>
          <p class="korail-support-form__status" aria-live="polite"></p>
        </form>
      </div>
       <div class="korail-support-choice korail-support-nearest" hidden>
        <button type="button" class="korail-support-back korail-support-nearest__back"></button>
        <form class="korail-nearest-search korail-support-nearest__form">
          <div class="korail-nearest-search__label-row">
            <label class="korail-nearest-search__label" for="korail-support-nearest-address" data-nearest-field="address"></label>
            <button type="button" class="korail-nearest-history-button" data-nearest-history-toggle aria-expanded="false" aria-controls="korail-support-nearest-history"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg><span data-nearest-history-label></span></button>
          </div>
          <div id="korail-support-nearest-history" class="korail-nearest-history" data-nearest-history hidden></div>
          <div class="korail-nearest-search__row">
            <input id="korail-support-nearest-address" data-nearest-address name="address" type="text" required autocomplete="street-address">
            <button type="submit" class="korail-nearest-card__button" data-nearest-submit></button>
          </div>
          <div class="korail-nearest-search__options">
            <label class="korail-nearest-search__toggle"><input data-nearest-include-all name="includeAll" type="checkbox"><span class="korail-nearest-search__switch" aria-hidden="true"></span><span data-nearest-field="includeAll"></span></label>
            <button type="button" class="korail-nearest-location-button korail-support-nearest__location" data-nearest-current-location><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg><span data-nearest-location-label></span></button>
          </div>
        </form>
         <div class="korail-nearest-card__result" data-nearest-result aria-live="polite"></div>
       </div>
     </section>`;
  document.body.appendChild(modal);

  const by = (selector) => modal.querySelector(selector);
  const choice = by(".korail-support-choice");
  const inquiry = by(".korail-support-inquiry");
  const feedback = by(".korail-support-feedback");
  const nearest = by(".korail-support-nearest");
  const nearestChoice = by("[data-support-choice='nearest']");
  function isGlobalNearestPage(pathname = location.pathname) {
    return /\/global\/(eng|jpn|chn|tw|vi|th|id)\/(?:main|ticket(?:\/.*)?)\/?$/i.test(pathname);
  }
  const setLabels = () => {
    by("#korail-support-title").textContent = text("서비스 안내", "Support");
    by(".korail-support-choice__notice").textContent = text("에러코드가 표시되면 페이지가 자동으로 새로고침됩니다.", "The page refreshes automatically when an error code appears.");
    by("[data-support-choice='nearest'] strong").textContent = text("가까운 주요역 찾기", "Find nearby major stations");
    by("[data-support-choice='nearest'] span").textContent = text("주소를 기준으로 가까운 주요역을 찾습니다.", "Find nearby major stations by address.");
    nearestChoice.hidden = !isGlobalNearestPage();
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
    by(".korail-support-nearest__back").textContent = text("← 처음으로", "← Back");
    by("[data-nearest-field='address']").textContent = text("출발 위치", "Starting location");
    by("[data-nearest-field='includeAll']").textContent = text("일반역 포함", "Include all stations");
    by(".korail-support-nearest__form input[name='address']").placeholder = text("예: 서울시청, 대구 수성구", "e.g. Seoul City Hall");
    by("[data-nearest-location-label]").textContent = text("내 위치", "My location");
    by("[data-nearest-history-label]").textContent = text("최근 기록", "History");
    by("[data-nearest-submit]").textContent = text("검색", "Search");
    window.KORAIL_HOME?.renderNearestResults?.(nearest, "idle", text("주소를 입력한 후 검색하세요.", "Enter an address and search."));
    by("[data-support-field='category']").textContent = text("문의 유형", "Category");
    by("[data-support-field='message']").textContent = text("문의 내용 *", "Message *");
    by("[data-support-field='contact']").textContent = text("회신 연락처 (선택)", "Reply contact (optional)");
    const options = by("select[name='category']").options;
    [text("오류 신고", "Bug report"), text("기능 제안", "Feature request"), text("기타", "Other")].forEach((label, index) => { options[index].text = label; });
    by("textarea").placeholder = text("문제 상황이나 제안 내용을 자세히 적어주세요.", "Describe the problem or suggestion in detail.");
    by("input[name='contact']").placeholder = text("이메일, 카카오톡 ID 등", "Email or another contact method");
    by(".korail-support-form__privacy").textContent = text("확장 프로그램에 관한 내용만 남겨주세요.", "Please send questions about this extension only.");
    by(".korail-support-modal__cancel").textContent = text("취소", "Cancel");
    by(".korail-support-form__submit").textContent = text("문의 제출", "Send feedback");
  };

  const showChoices = () => { choice.hidden = false; inquiry.hidden = true; feedback.hidden = true; nearest.hidden = true; };
  const showInquiry = () => { choice.hidden = true; inquiry.hidden = false; feedback.hidden = true; nearest.hidden = true; };
  const showNearest = () => {
    if (!isGlobalNearestPage()) return;
    window.KORAIL_HOME?.bindNearestHistory?.(nearest);
    window.KORAIL_HOME?.bindNearestStationActions?.(nearest);
    choice.hidden = true;
    inquiry.hidden = true;
    feedback.hidden = true;
    nearest.hidden = false;
  };
  const close = () => { modal.hidden = true; showChoices(); };
  const open = () => { setLabels(); by(".korail-support-form__status").textContent = ""; by(".korail-support-form__status").dataset.state = ""; showChoices(); modal.hidden = false; };
  launcher.addEventListener("click", () => {
    if (modal.hidden) open();
    else close();
  });
  by(".korail-support-modal__close").addEventListener("click", close);
  by(".korail-support-modal__cancel").addEventListener("click", close);
  by(".korail-support-modal__backdrop").addEventListener("click", close);
  by(".korail-support-feedback__back").addEventListener("click", showInquiry);
  by(".korail-support-nearest__back").addEventListener("click", showChoices);
  by(".korail-support-inquiry__back").addEventListener("click", showChoices);
  by("[data-support-choice='inquiry']").addEventListener("click", showInquiry);
  by("[data-support-choice='nearest']").addEventListener("click", showNearest);
  by("[data-support-choice='extension']").addEventListener("click", () => { inquiry.hidden = true; feedback.hidden = false; by("textarea").focus(); });
  by("[data-support-choice='korail']").addEventListener("click", () => window.open(officialCenterUrl, "_blank", "noopener"));
  by("[data-support-choice='restaurant']").addEventListener("click", () => window.open(restaurantGuideUrl(), "_blank", "noopener"));
  by("[data-nearest-current-location]").addEventListener("click", async () => {
    const button = by("[data-nearest-current-location]");
    const input = by(".korail-support-nearest__form input[name='address']");
    const label = by("[data-nearest-location-label]");
    button.disabled = true;
    label.textContent = text("위치 확인 중…", "Locating…");
    try {
      const address = await window.KORAIL_HOME?.getCurrentLocationAddress?.();
      if (!address) throw new Error("location service unavailable");
      input.value = address;
      input.focus();
    } catch {
      window.KORAIL_HOME?.renderNearestResults?.(nearest, "error", text("현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.", "Unable to get your current location. Check location permission."));
    } finally {
      button.disabled = false;
      label.textContent = text("내 위치", "My location");
    }
  });
  by(".korail-support-nearest__form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = by("[data-nearest-submit]");
    window.KORAIL_HOME?.renderNearestResults?.(nearest, "loading", text("계산 중입니다.", "Calculating."));
    submit.disabled = true;
    try {
      const stations = await window.KORAIL_HOME?.findNearestStationResults?.(form.elements.address.value, form.elements.includeAll.checked);
      if (!stations) throw new Error(text("서비스를 준비하는 중입니다. 잠시 후 다시 시도해주세요.", "The service is still loading. Please try again shortly."));
      window.KORAIL_HOME.renderNearestResults(nearest, "done", text("가까운 주요역", "Nearby major stations"), stations);
    } catch (error) {
      window.KORAIL_HOME?.renderNearestResults?.(nearest, "error", error.message || text("조회 중 오류가 발생했습니다.", "An error occurred while searching."));
    } finally {
      submit.disabled = false;
    }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) close(); });

  function submitToBackground(payload) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (callback) => {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        callback();
      };
      const timer = setTimeout(() => finish(() => reject(new Error("timeout"))), 15000);
      const handler = (event) => {
        if (event.source !== window || event.data?.type !== "KORAIL_SUPPORT_RESPONSE" || event.data.requestId !== requestId) return;
        if (event.data.ok && event.data.result?.accepted === true) finish(() => resolve(event.data.result));
        else finish(() => reject(new Error(event.data.error || "Feedback submission failed.")));
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "KORAIL_SUPPORT_SUBMIT", requestId, payload }, "*");
    });
  }

  by(".korail-support-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = by(".korail-support-form__status");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submit = by(".korail-support-form__submit");
    submit.disabled = true;
    status.dataset.state = "";
    status.textContent = text("전송 중…", "Sending…");
    try {
      await submitToBackground({ category: form.get("category"), message: form.get("message"), contact: form.get("contact"), pageUrl: location.href, locale: window.KORAIL_SHARED?.getKorailLocale?.() || "unknown" });
      formElement.reset();
      status.dataset.state = "success";
      status.textContent = text("🎉 문의가 성공적으로 전달되었습니다.", "🎉 Your feedback has been sent successfully.");
    } catch (error) {
      status.dataset.state = "";
      status.textContent = String(error.message || "").includes("429")
        ? text("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", "Too many requests. Please try again later.")
        : text("전송에 실패했습니다. 잠시 후 다시 시도해주세요.", "Sending failed. Please try again later.");
    } finally {
      submit.disabled = false;
    }
  });

  const errorCodePattern = /\bCODE\s*:\s*-\d+/i;
  const errorDialogSelector = ".ReactModal__Content, [role='dialog'], .layerWrap, .modal, .popup";
  const errorReloadStorageKey = "korail-error-reload-attempted";
  let errorReloadScheduled = false;

  function isVisibleErrorDialog(dialog) {
    if (dialog.hidden || dialog.getAttribute("aria-hidden") === "true") return false;
    const rect = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    return rect.width > 0
      && rect.height > 0
      && rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity || "1") > 0;
  }

  function mutationTouchesErrorDialog(records) {
    const elementFor = (node) => node?.nodeType === 1 ? node : node?.parentElement;
    const isInsideDialog = (node) => {
      const element = elementFor(node);
      return !!element
        && (element.matches?.(errorDialogSelector) || element.closest?.(errorDialogSelector));
    };
    const containsDialog = (node) => {
      const element = elementFor(node);
      return isInsideDialog(element)
        || (element !== document.body && !!element?.querySelector?.(errorDialogSelector));
    };
    return records.some((record) => isInsideDialog(record.target)
      || (record.type === "attributes" && containsDialog(record.target))
      || [...record.addedNodes].some(containsDialog));
  }

  function hasAttemptedErrorReload() {
    try {
      return sessionStorage.getItem(errorReloadStorageKey) === "true";
    } catch {
      return false;
    }
  }

  function setAttemptedErrorReload(attempted) {
    try {
      if (attempted) sessionStorage.setItem(errorReloadStorageKey, "true");
      else sessionStorage.removeItem(errorReloadStorageKey);
    } catch {
      // sessionStorage can be unavailable in restricted browser modes.
    }
  }

  const reloadOnErrorCode = () => {
    const dialogs = [...document.querySelectorAll(errorDialogSelector)].filter(isVisibleErrorDialog);
    const hasErrorCode = dialogs.some((dialog) => errorCodePattern.test(dialog.textContent || ""));
    if (!hasErrorCode) {
      if (!errorReloadScheduled) setAttemptedErrorReload(false);
      return;
    }
    if (errorReloadScheduled || hasAttemptedErrorReload()) return;

    errorReloadScheduled = true;
    setAttemptedErrorReload(true);
    const randomNumber = Math.floor(Math.random() * 101) + 100;
    setTimeout(() => location.reload(), randomNumber);
  };

  let errorDialogScanFrame = null;
  const errorDialogObserver = new MutationObserver((records) => {
    if (!mutationTouchesErrorDialog(records)) return;
    if (errorDialogScanFrame !== null) return;
    errorDialogScanFrame = requestAnimationFrame(() => {
      errorDialogScanFrame = null;
      reloadOnErrorCode();
    });
  });
  errorDialogObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"],
  });
  reloadOnErrorCode();
})();
