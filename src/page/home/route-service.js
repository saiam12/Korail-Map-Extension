// Route lookups and nearest-station sorting used by the home panel controller.

window.KORAIL_HOME_ROUTE_SERVICE = {
  create({ requestMapsApi, geocodeAddress, formatDistance, formatDuration, t }) {
    function hasResolvedDrivingRoute(station) {
      return station.drivingAvailable === false
        || (station.drivingAvailable === true
          && Number.isFinite(station.durationSeconds)
          && station.durationSeconds > 0);
    }

    async function addDrivingRouteInfo(origin, stations) {
      const results = stations.slice();

      for (const [index, station] of stations.entries()) {
        if (hasResolvedDrivingRoute(station)) continue;
        const payload = {
          startLat: origin.lat,
          startLng: origin.lng,
          goalLat: station.lat,
          goalLng: station.lng,
        };
        try {
          const drivingData = await requestMapsApi("driving", payload);
          const drivingSummary = drivingData.route?.trafast?.[0]?.summary;
          if (!drivingSummary) {
            const responseCode = Number(drivingData.code);
            if (drivingData.available === false
              || (Number.isInteger(responseCode) && responseCode >= 1 && responseCode <= 5)) {
              results[index] = { ...station, drivingAvailable: false };
            }
            continue;
          }
          results[index] = {
            ...station,
            drivingAvailable: true,
            durationSeconds: drivingSummary.duration / 1000,
            durationText: formatDuration(drivingSummary.duration / 1000),
            distanceText: formatDistance(drivingSummary.distance),
            distanceMeters: drivingSummary.distance,
          };
        } catch (error) {
          console.warn("[Korail] Naver driving request failed:", station.name, error);
          if (error?.status === 429) {
            error.partialResults = results;
            throw error;
          }
        }
      }
      return results;
    }

    function hasResolvedTransitRoute(station) {
      return station.transitAvailable === false
        || (station.transitAvailable === true
          && Number.isFinite(station.transitDurationSeconds)
          && station.transitDurationSeconds > 0);
    }

    async function addTransitRouteInfo(origin, stations) {
      const pendingStations = stations
        .map((station, index) => ({ station, index }))
        .filter(({ station }) => !hasResolvedTransitRoute(station));
      if (!pendingStations.length) return stations;

      const settled = await Promise.allSettled(pendingStations.map(({ station }) => requestMapsApi("transit", {
        startLat: origin.lat,
        startLng: origin.lng,
        goalLat: station.lat,
        goalLng: station.lng,
      })));
      const results = stations.slice();

      pendingStations.forEach(({ station, index }, pendingIndex) => {
        const transitResult = settled[pendingIndex];
        if (transitResult.status === "rejected") {
          console.warn("[Korail] Kakao transit request failed:", station.name, transitResult.reason);
          return;
        }
        if (transitResult.value?.available === false) {
          results[index] = { ...station, transitAvailable: false };
          return;
        }
        const transitDurationSeconds = Number(transitResult.value?.durationSeconds);
        if (!Number.isFinite(transitDurationSeconds) || transitDurationSeconds <= 0) return;
        results[index] = {
          ...station,
          transitAvailable: true,
          transitDurationSeconds,
          transitDurationText: formatDuration(transitDurationSeconds),
        };
      });
      return results;
    }

    async function findRouteSummary(departure, arrival) {
      const [origin, destination] = await Promise.all([
        geocodeAddress(departure),
        geocodeAddress(arrival),
      ]);
      const payload = {
        startLat: origin.lat,
        startLng: origin.lng,
        goalLat: destination.lat,
        goalLng: destination.lng,
      };
      const [drivingResult, transitResult] = await Promise.allSettled([
        requestMapsApi("driving", payload),
        requestMapsApi("transit", payload),
      ]);
      const drivingSummary = drivingResult.status === "fulfilled"
        ? drivingResult.value?.route?.trafast?.[0]?.summary
        : null;
      const drivingDurationSeconds = Number(drivingSummary?.duration) / 1000;
      const distanceMeters = Number(drivingSummary?.distance);
      const transitDurationSeconds = transitResult.status === "fulfilled" && transitResult.value?.available !== false
        ? Number(transitResult.value?.durationSeconds)
        : NaN;
      const transitSteps = transitResult.status === "fulfilled" && Array.isArray(transitResult.value?.steps)
        ? transitResult.value.steps
          .map((step) => ({
            type: step?.type,
            durationSeconds: Number(step?.time),
            vehicleNames: Array.isArray(step?.vehicleNames) ? step.vehicleNames.filter((name) => typeof name === "string") : [],
          }))
          .filter((step) => ["WALKING", "BUS", "SUBWAY"].includes(step.type)
            && Number.isFinite(step.durationSeconds) && step.durationSeconds > 0)
          .map((step) => ({ ...step, durationText: formatDuration(step.durationSeconds) }))
        : [];
      const additionalTransitDurationSeconds = transitResult.status === "fulfilled"
        ? Number(transitResult.value?.additionalDurationSeconds)
        : NaN;
      if (Number.isFinite(additionalTransitDurationSeconds) && additionalTransitDurationSeconds >= 30) {
        transitSteps.unshift({
          type: "WALKING",
          durationSeconds: additionalTransitDurationSeconds,
          durationText: formatDuration(additionalTransitDurationSeconds),
          vehicleNames: [],
        });
      }

      if (drivingResult.status === "rejected") {
        console.warn("[Korail] Route driving request failed:", drivingResult.reason);
      }
      if (transitResult.status === "rejected") {
        console.warn("[Korail] Route transit request failed:", transitResult.reason);
      }

      return {
        drivingDurationText: Number.isFinite(drivingDurationSeconds) && drivingDurationSeconds > 0
          ? formatDuration(drivingDurationSeconds)
          : "",
        transitDurationText: Number.isFinite(transitDurationSeconds) && transitDurationSeconds > 0
          ? formatDuration(transitDurationSeconds)
          : "",
        distanceText: Number.isFinite(distanceMeters) && distanceMeters >= 0
          ? formatDistance(distanceMeters)
          : "",
        transitSteps,
      };
    }

    function normalizeNearestSortMode(sortMode) {
      return sortMode === "transit" ? "transit" : "driving";
    }

    function compareOptionalDuration(left, right) {
      const leftValue = Number.isFinite(left) ? left : Infinity;
      const rightValue = Number.isFinite(right) ? right : Infinity;
      if (leftValue === rightValue) return 0;
      return leftValue - rightValue;
    }

    function sortNearestResults(stations, sortMode) {
      const normalizedSortMode = normalizeNearestSortMode(sortMode);
      return stations.slice().sort((left, right) => {
        const primary = normalizedSortMode === "transit"
          ? compareOptionalDuration(left.transitDurationSeconds, right.transitDurationSeconds)
          : compareOptionalDuration(left.durationSeconds, right.durationSeconds);
        if (primary) return primary;
        const driving = compareOptionalDuration(left.durationSeconds, right.durationSeconds);
        if (driving) return driving;
        const distance = compareOptionalDuration(left.straightDistanceMeters, right.straightDistanceMeters);
        if (distance) return distance;
        return String(left.name).localeCompare(String(right.name), "ko");
      });
    }

    function mergeNearestRouteResults(stations, updates) {
      const updatesByName = new Map(updates.map((station) => [station.name, station]));
      return stations.map((station) => updatesByName.get(station.name) || station);
    }

    async function prepareNearestResults(origin, stations, sortMode, resultLimit) {
      const normalizedSortMode = normalizeNearestSortMode(sortMode);
      let allResults;
      try {
        allResults = await addDrivingRouteInfo(origin, stations);
      } catch (error) {
        return {
          allResults: Array.isArray(error?.partialResults) ? error.partialResults : stations,
          visibleResults: [],
          error,
        };
      }
      let preparationError = null;
      if (normalizedSortMode === "transit") {
        allResults = await addTransitRouteInfo(origin, allResults);
        if (allResults.some((station) => !hasResolvedTransitRoute(station))) {
          preparationError = new Error(t("transitUnavailable"));
        } else if (!allResults.some((station) => Number.isFinite(station.transitDurationSeconds))) {
          preparationError = new Error(t("transitUnavailable"));
        }
      } else {
        if (allResults.some((station) => !hasResolvedDrivingRoute(station))) {
          preparationError = new Error(t("drivingUnavailable"));
        }
        const drivingTop = sortNearestResults(allResults, "driving")
          .filter((station) => Number.isFinite(station.durationSeconds))
          .slice(0, resultLimit);
        if (!drivingTop.length) preparationError = new Error(t("drivingUnavailable"));
        if (!preparationError) {
          const drivingTopWithTransit = await addTransitRouteInfo(origin, drivingTop);
          allResults = mergeNearestRouteResults(allResults, drivingTopWithTransit);
        }
      }
      const visibleResults = sortNearestResults(allResults, normalizedSortMode)
        .filter((station) => normalizedSortMode === "transit"
          ? Number.isFinite(station.transitDurationSeconds)
          : Number.isFinite(station.durationSeconds))
        .slice(0, resultLimit);
      return {
        allResults,
        visibleResults,
        error: preparationError,
      };
    }

    return {
      addDrivingRouteInfo,
      addTransitRouteInfo,
      findRouteSummary,
      hasResolvedDrivingRoute,
      hasResolvedTransitRoute,
      mergeNearestRouteResults,
      normalizeNearestSortMode,
      prepareNearestResults,
      sortNearestResults,
    };
  },
};
