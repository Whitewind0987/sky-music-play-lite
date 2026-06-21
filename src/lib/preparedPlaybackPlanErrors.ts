const preparedPlanUnavailableMarker =
  "Prepared background playback plan is no longer available.";

export function isPreparedPlaybackPlanUnavailableError(error: unknown) {
  return String(error).includes(preparedPlanUnavailableMarker);
}
