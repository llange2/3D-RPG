/** Hands a text to the user as a file download (Esc > Debug > Export saves). */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // (the download has started by the time the browser looks at the address again)
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lets the user pick a text file; null when the picker is closed without a file. Must be called from the click that asked for it. */
export function pickTextFile(accept = ".json,application/json"): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then((text) => resolve({ name: file.name, text }), () => resolve(null));
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
