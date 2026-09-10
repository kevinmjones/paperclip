import { describe, expect, it } from "vitest";
import {
  assertAdapterModelCompatibility,
  assertAdapterModelCompatibilityBeforeDispatch,
  classifyDeterministicTerminalErrorCode,
  isDeterministicTerminalFailedRun,
} from "./heartbeat.js";

describe("terminal run circuit breaker", () => {
  it("rejects a Claude model on codex_local before dispatch", () => {
    expect(() =>
      assertAdapterModelCompatibility({
        adapterType: "codex_local",
        adapterConfig: { model: "claude-sonnet-4-6" },
      }),
    ).toThrow(/unsupported model\/backend combination/i);
  });

  it("preserves custom Codex gateway model IDs", () => {
    expect(() =>
      assertAdapterModelCompatibility({
        adapterType: "codex_local",
        adapterConfig: { model: "company-codex-finetune" },
      }),
    ).not.toThrow();
  });

  it("rejects a configured model absent from an authoritative adapter catalog", () => {
    expect(() =>
      assertAdapterModelCompatibility({
        adapterType: "agy",
        adapterConfig: { model: "gemini-3.5-flash" },
        authoritativeModels: [{ id: "Gemini 3.6 Flash (High)" }],
      }),
    ).toThrow(/not advertised by agy/i);
  });

  it("rejects an agy model absent from the adapter's own authoritative catalog before dispatch", async () => {
    let listModelsCalls = 0;
    const adapter = {
      listModels: async () => {
        listModelsCalls += 1;
        return [{ id: "Gemini 3.6 Flash (High)" }];
      },
    };

    await expect(
      assertAdapterModelCompatibilityBeforeDispatch({
        adapterType: "agy",
        adapterConfig: { model: "gemini-3.5-flash" },
        adapter,
      }),
    ).rejects.toThrow(/not advertised by agy/i);
    expect(listModelsCalls).toBe(1);
  });

  it.each([undefined, "", "auto"])("allows the backend-default model sentinel %s", (model) => {
    expect(() =>
      assertAdapterModelCompatibility({
        adapterType: "agy",
        adapterConfig: model === undefined ? {} : { model },
        authoritativeModels: [{ id: "Gemini 3.6 Flash (High)" }],
      }),
    ).not.toThrow();
  });

  it("preserves custom model IDs when no authoritative catalog exists", () => {
    expect(() =>
      assertAdapterModelCompatibility({
        adapterType: "custom_adapter",
        adapterConfig: { model: "company-finetune" },
        authoritativeModels: null,
      }),
    ).not.toThrow();
  });

  it.each([
    ["The model claude-sonnet-4-6 is unsupported for this account", "model_not_found"],
    ["maximum context window exceeded: too many tokens", "context_window_exhausted"],
  ])("classifies repeated terminal failure %s", (errorMessage, expectedCode) => {
    const errorCode = classifyDeterministicTerminalErrorCode({ errorMessage });
    expect(errorCode).toBe(expectedCode);
    expect(isDeterministicTerminalFailedRun({ errorCode })).toBe(true);
  });

  it.each([
    "acpx_auth_required",
    "claude_auth_required",
    "codex_auth_required",
    "gemini_auth_required",
    "grok_auth_required",
    "kimi_auth_required",
  ])("blocks terminal adapter auth failure %s without retrying", (errorCode) => {
    expect(isDeterministicTerminalFailedRun({ errorCode })).toBe(true);
  });
});
