export function geolocationUserMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code: number }).code);
    if (code === 1) {
      return "Location access was blocked. Allow location for this site in your browser settings, or pick a city from the list.";
    }
    if (code === 2) {
      return "Location is unavailable on this device. Pick a city from the list instead.";
    }
    if (code === 3) {
      return "Location request timed out. Try again or pick a city from the list.";
    }
  }
  const text = String(error);
  if (text.includes("404") && text.toLowerCase().includes("resolve")) {
    return "Could not resolve your city from GPS. Pick a city from the list instead.";
  }
  return text.replace(/^\d+:\s*/, "");
}
