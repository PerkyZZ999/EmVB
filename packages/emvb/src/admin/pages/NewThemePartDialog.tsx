import { Select } from "@cloudflare/kumo";
import * as React from "react";
import { THEME_PART_TYPES, THEME_PART_TYPE_LABELS, type ThemePartType } from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { createThemePart } from "../theme-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { FIELD } from "../ui.ts";
import { CreateDialog } from "./CreateDialog.tsx";

const TYPES = THEME_PART_TYPES.map((value) => ({
  value,
  label: THEME_PART_TYPE_LABELS[value],
}));

/** New theme part: type + title, then open the shared editor. */
export function NewThemePartDialog({
  fetcher,
  open,
  onOpenChange,
}: {
  fetcher: Fetcher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [partType, setPartType] = React.useState<ThemePartType>("header");
  return (
    <CreateDialog
      name="new-theme-part"
      heading="New theme part"
      noun="theme part"
      emptyTitle="Enter a title."
      slugPrefix={`${partType}-`}
      slugHint="Internal id only — theme parts are not public URLs."
      submitLabel="Create"
      open={open}
      onOpenChange={onOpenChange}
      create={async (title, slug) =>
        editorUrl(await createThemePart(fetcher, { title, slug, partType }), THEME_PARTS_COLLECTION)
      }
    >
      <Select
        label="Type"
        className={FIELD}
        value={partType}
        onValueChange={(value) =>
          setPartType(TYPES.find((option) => option.value === value)?.value ?? "header")
        }
        renderValue={(value: unknown) =>
          TYPES.find((option) => option.value === value)?.label ?? String(value)
        }
      >
        {TYPES.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    </CreateDialog>
  );
}
