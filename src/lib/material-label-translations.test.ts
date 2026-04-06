import assert from "node:assert/strict";
import test from "node:test";

import { loadMaterialDictionaryFromDisk } from "@/lib/layer2-translate";
import {
  loadMaterialLabelTranslationsFromDisk,
  nlLabelForDictionaryEntry,
} from "@/lib/material-label-translations";

test("material-label-translations: each row maps to material-dictionary.json", () => {
  const { entries } = loadMaterialDictionaryFromDisk();
  const { file } = loadMaterialLabelTranslationsFromDisk();

  const bySlug = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = bySlug.get(e.epdSlug) ?? [];
    list.push(e);
    bySlug.set(e.epdSlug, list);
  }

  for (const t of file.translations) {
    const list = bySlug.get(t.epdSlug);
    assert.ok(list && list.length > 0, `unknown epdSlug in translations: ${t.epdSlug}`);

    if (t.standardNameEn) {
      const hit = list.find((e) => e.standardName === t.standardNameEn);
      assert.ok(
        hit,
        `standardNameEn "${t.standardNameEn}" not found for epdSlug ${t.epdSlug}`
      );
    } else {
      assert.ok(
        list.length === 1,
        `translation for ${t.epdSlug} needs standardNameEn (dictionary has ${list.length} rows)`
      );
      assert.equal(list[0].standardName, t.en, `en mismatch for ${t.epdSlug}`);
    }
  }
});

test("material-label-translations: nlLabelForDictionaryEntry resolves both timber rows", () => {
  assert.equal(
    nlLabelForDictionaryEntry("timber", "Timber (dormer / roof carpentry)"),
    "Hout (dakkapel / dakconstructie)"
  );
  assert.equal(nlLabelForDictionaryEntry("timber", "Timber"), "Hout");
});

test("material-label-translations: AAC nl", () => {
  assert.equal(
    nlLabelForDictionaryEntry("aac", "Autoclaved aerated concrete"),
    "Gasbeton / cellenbeton"
  );
});
