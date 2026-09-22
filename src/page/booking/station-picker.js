// Korail station picker DOM integration.

window.KORAIL_BOOKING_STATION_PICKER = {
  create({ isGlobalTicketPage, stationName, getCurrentStationKey, findStationKeyInText }) {
    function getStationFields(type) {
      const selectors = type === "dep"
        ? ["#labelstart", "#txtGoStart", ".station_item.n1 span.input", "input[id*='start' i]", "input[name*='start' i]", "input[id*='dep' i]", "input[name*='dep' i]", "a.btn_pop.btn_start"]
        : ["#labelend", "#txtGoEnd", ".station_item.n2 span.input", "input[id*='end' i]", "input[name*='end' i]", "input[id*='arr' i]", "input[name*='arr' i]", "a.btn_pop.btn_end"];

      return [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))];
    }

    function findVisibleStationField(type) {
      if (isGlobalTicketPage()) {
        const globalSelector = type === "dep" ? "a.btn_pop.btn_start" : "a.btn_pop.btn_end";
        const globalField = [...document.querySelectorAll(globalSelector)].find((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (globalField) return globalField;
      }
      return getStationFields(type).find((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      }) || null;
    }

    function getStationFieldValue(field) {
      return String(("value" in field && typeof field.value === "string") ? field.value : field.textContent || "").trim();
    }

    function normalizeStationOptionText(value) {
      return String(value || "").replace(/\s+/g, "").toLocaleLowerCase();
    }

    function matchesStationOption(el, targetStationName) {
      const text = normalizeStationOptionText(el.textContent);
      const name = normalizeStationOptionText(targetStationName);
      return text === name || text === `${name}station` || text === `${name}역`;
    }

    function findStationPickerByOption(targetStationName) {
      const matchingNodes = [...document.querySelectorAll("button, a, [role='button'], li, span, strong")]
        .filter((el) => matchesStationOption(el, targetStationName));

      for (const node of matchingNodes) {
        let container = node.parentElement;
        while (container && container !== document.body) {
          const rect = container.getBoundingClientRect();
          const optionCount = container.querySelectorAll("button, a, [role='button'], li").length;
          const style = getComputedStyle(container);
          const isOverlay = style.position === "fixed"
            || container.matches(".layerWrap, .layer_wrap, [role='dialog'], [class*='popup'], [class*='modal']");
          if (isOverlay && rect.width > 0 && rect.height > 0 && optionCount >= 4) return container;
          container = container.parentElement;
        }
      }
      return null;
    }

    function waitForStationPicker(targetStationName, timeout = 3000) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        function findPicker() {
          const optionPicker = findStationPickerByOption(targetStationName);
          if (optionPicker) return resolve(optionPicker);

          const pickerSelector = ".layerWrap, .layer_wrap, [role='dialog'], [class*='popup'], [class*='modal']";
          const searchInput = [...document.querySelectorAll("input")].find((input) => {
            return /역\s*이름|초성\s*검색|station|search/i.test(input.placeholder || "")
              && input.closest(pickerSelector);
          });
          if (searchInput) {
            const picker = searchInput.closest(pickerSelector);
            if (picker && picker.getBoundingClientRect().width > 0) return resolve(picker);
          }
          if (Date.now() - startedAt >= timeout) return resolve(null);
          requestAnimationFrame(findPicker);
        }
        findPicker();
      });
    }

    function findStationPickerOption(picker, targetStationName) {
      return [...picker.querySelectorAll("button, a, [role='button'], li, span, strong")]
        .filter((el) => matchesStationOption(el, targetStationName))
        .map((el) => el.closest("button, a, [role='button'], li") || el)
        .sort((a, b) => Number(!a.matches("button, a, [role='button']")) - Number(!b.matches("button, a, [role='button']")))
        .find((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }) || null;
    }

    function findVisibleStationPickerTrigger(type) {
      const selector = type === "dep" ? "a.btn_pop.btn_start" : "a.btn_pop.btn_end";
      return [...document.querySelectorAll(selector)].find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
    }

    function waitForStationPickerTrigger(type, timeout = 3000) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        function findTrigger() {
          const trigger = findVisibleStationPickerTrigger(type);
          if (trigger || Date.now() - startedAt >= timeout) return resolve(trigger);
          requestAnimationFrame(findTrigger);
        }
        findTrigger();
      });
    }

    async function chooseStationThroughPicker(type, targetStationName) {
      let trigger = findVisibleStationPickerTrigger(type);
      if (!trigger && location.pathname.includes("/intro")) {
        document.querySelector("button.search_btn")?.click();
        trigger = await waitForStationPickerTrigger(type);
      }
      if (!trigger) return false;

      trigger.click();
      const picker = await waitForStationPicker(targetStationName);
      const option = picker && findStationPickerOption(picker, targetStationName);
      if (!option) {
        const closeButton = picker && [...picker.querySelectorAll("button, a")].find((el) => {
          return /close|닫기|×|✕/i.test(`${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.title || ""}`);
        });
        closeButton?.click();
        return false;
      }

      option.click();
      return true;
    }

    async function swapStationsThroughPicker(depField, arrField) {
      const displayedDep = getStationFieldValue(depField);
      const displayedArr = getStationFieldValue(arrField);
      const depKey = getCurrentStationKey("dep") || findStationKeyInText(displayedDep);
      const arrKey = getCurrentStationKey("arr") || findStationKeyInText(displayedArr);
      const depStation = depKey ? stationName(depKey) : displayedDep;
      const arrStation = arrKey ? stationName(arrKey) : displayedArr;
      if (!depStation || !arrStation) return false;

      const departureChanged = await chooseStationThroughPicker("dep", arrStation);
      if (!departureChanged) return false;
      return chooseStationThroughPicker("arr", depStation);
    }

    return {
      chooseStationThroughPicker,
      findVisibleStationField,
      swapStationsThroughPicker,
    };
  },
};
