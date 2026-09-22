// Location calculations used by the home panel controller.

window.KORAIL_HOME_LOCATION_SERVICE = {
  create({ stations, isKoreanLocale, t }) {
    function getSearchStations(includeAllStations = false) {
      return Object.entries(stations)
        .filter(([, coords]) => includeAllStations || coords.major === true)
        .filter(([, coords]) => Number.isFinite(coords.lat) && Number.isFinite(coords.lng))
        .map(([name, coords]) => ({ name, lat: coords.lat, lng: coords.lng }));
    }

    function getDistanceMeters(from, to) {
      const earthRadius = 6371000;
      const toRad = (deg) => deg * Math.PI / 180;
      const dLat = toRad(to.lat - from.lat);
      const dLng = toRad(to.lng - from.lng);
      const lat1 = toRad(from.lat);
      const lat2 = toRad(to.lat);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistance(meters) {
      if (meters < 1000) return `${Math.round(meters)}m`;
      return `${(meters / 1000).toFixed(1)}km`;
    }

    function formatDuration(seconds) {
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return isKoreanLocale() ? `${minutes}분` : `${minutes} ${t("minute")}`;
      const hours = Math.floor(minutes / 60);
      const remain = minutes % 60;
      if (!isKoreanLocale()) return remain ? `${hours} ${t("hour")} ${remain} ${t("minute")}` : `${hours} ${t("hour")}`;
      return remain ? `${hours}시간 ${remain}분` : `${hours}시간`;
    }

    function getNearestByDistance(origin, limit = 3, includeAllStations = false) {
      return getSearchStations(includeAllStations)
        .map((station) => {
          const distanceMeters = getDistanceMeters(origin, station);
          return {
            ...station,
            straightDistanceMeters: distanceMeters,
            distanceMeters,
            distanceText: formatDistance(distanceMeters),
          };
        })
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, limit);
    }

    function formatCachedNearestResults(results) {
      return results.map((station) => ({
        ...station,
        durationText: Number.isFinite(station.durationSeconds)
          ? formatDuration(station.durationSeconds)
          : "",
        transitDurationText: Number.isFinite(station.transitDurationSeconds)
          ? formatDuration(station.transitDurationSeconds)
          : "",
        distanceText: Number.isFinite(station.distanceMeters)
          ? formatDistance(station.distanceMeters)
          : "",
      }));
    }

    return {
      formatCachedNearestResults,
      formatDistance,
      formatDuration,
      getDistanceMeters,
      getNearestByDistance,
      getSearchStations,
    };
  },
};
