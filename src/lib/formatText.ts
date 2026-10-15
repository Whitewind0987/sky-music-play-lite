export function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  // Split/join avoids String.replace "$&"/"$'" patterns mangling values such
  // as file names, and replaces every occurrence of a placeholder.
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  );
}
