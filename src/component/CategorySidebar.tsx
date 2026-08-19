import type { ComponentChildren } from "preact";
import { CustomExtensionService } from "@/service/CustomExtensionService";
import { t } from "@/i18n/i18n";
import cn from "@/util/cn";
import type { FusamAddon, Registry } from "@/domain/Registry";

/**
 * A category the user can pick from the sidebar.
 * - `all`      : every available mod
 * - `tag`      : mods that carry a specific tag (e.g. "recommend")
 * - `registry` : mods that come from a specific registry source
 */
export type Category =
  | { type: "all" }
  | { type: "recommend" }
  | { type: "tag"; value: string }
  | { type: "registry"; value: string };

interface AvailableMod {
  addon: FusamAddon;
  registryId: string;
  registryUrl: string;
}

interface CategorySidebarProps {
  availableMods: AvailableMod[];
  registries: Registry[];
  selected: Category;
  onSelect: (category: Category) => void;
}

/**
 * The tag that is always pinned at the top of the sidebar (second position,
 * right below "All"), regardless of whether any mod actually carries it.
 */
const RECOMMEND_TAG = "recommended";
export const RECOMMEND_MOD_IDS = new Set<string>(["WCE", "BCX", "LSCG", "MBS", "echocloth", "echomove"]);
function isRecommend(mod: { addon: FusamAddon }): boolean {
  return !!mod.addon.tags?.includes(RECOMMEND_TAG) || RECOMMEND_MOD_IDS.has(mod.addon.id);
}

/**
 * Build a human-friendly label for a registry source.
 * - Custom extensions → localized "Custom Extensions"
 * - Preset registries → their id (already meaningful, e.g. "sidiousious")
 * - User registries    → hostname extracted from the URL (auto-generated ids
 *                        like `registry_1234_abc` are not user-friendly)
 */
function getRegistryLabel(registryId: string, registries: Registry[]): string {
  if (registryId === CustomExtensionService.getCustomRegistryId()) {
    return t("sidebar-custom-extensions");
  }
  const registry = registries.find((r) => r.id === registryId);
  if (!registry) return registryId;
  if (registry.isPreset) return registry.id;
  try {
    const url = new URL(registry.url);
    return url.hostname;
  } catch {
    return registry.id;
  }
}

/**
 * Sort registry ids so that preset registries come first (in their original
 * declaration order), user-added registries next, and the custom-extensions
 * bucket always last.
 */
function sortRegistryIds(ids: string[], registries: Registry[], customId: string): string[] {
  const presetOrder = registries.filter((r) => r.isPreset).map((r) => r.id);
  const userOrder = registries.filter((r) => !r.isPreset).map((r) => r.id);

  return [...ids].sort((a, b) => {
    if (a === customId) return 1;
    if (b === customId) return -1;

    const ai = presetOrder.indexOf(a);
    const bi = presetOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;

    const au = userOrder.indexOf(a);
    const bu = userOrder.indexOf(b);
    if (au !== -1 && bu !== -1) return au - bu;
    if (au !== -1) return -1;
    if (bu !== -1) return 1;
    return 0;
  });
}

export default function CategorySidebar({ availableMods, registries, selected, onSelect }: CategorySidebarProps) {
  // ----- counts -----
  const allCount = availableMods.length;

  const recommendCount = availableMods.filter(isRecommend).length;

  // unique tags excluding the pinned "recommend"
  const tagSet = new Set<string>();
  availableMods.forEach((m) => {
    m.addon.tags?.forEach((tag) => {
      if (tag !== RECOMMEND_TAG) tagSet.add(tag);
    });
  });
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  // unique registry ids: union of (mods' registry ids) and (all known registries)
  const customId = CustomExtensionService.getCustomRegistryId();
  const registryIdSet = new Set<string>();
  availableMods.forEach((m) => registryIdSet.add(m.registryId));
  registries.forEach((r) => registryIdSet.add(r.id));
  registryIdSet.add(customId);
  const sortedRegistryIds = sortRegistryIds(Array.from(registryIdSet), registries, customId);

  const registryCounts = new Map<string, number>();
  sortedRegistryIds.forEach((id) => {
    registryCounts.set(id, availableMods.filter((m) => m.registryId === id).length);
  });

  // ----- helpers -----
  const isSelected = (cat: Category): boolean => {
    if (cat.type !== selected.type) return false;
    if (cat.type === "tag" && selected.type === "tag") {
      return cat.value === selected.value;
    }
    if (cat.type === "registry" && selected.type === "registry") {
      return cat.value === selected.value;
    }
    return true;
  };

  const renderItem = (cat: Category, label: string, count: number, accent?: boolean) => {
    const isSel = isSelected(cat);
    const key =
      cat.type === "all"
        ? "cat-all"
        : cat.type === "recommend"
          ? "cat-recommend"
          : cat.type === "tag"
            ? `cat-tag-${cat.value}`
            : `cat-reg-${cat.value}`;

    return (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(cat)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
          isSel
            ? "bg-bmm-accent font-bold text-white shadow-bmm-control"
            : cn("text-bmm-ink hover:bg-bmm-surface-muted", accent && "font-semibold text-bmm-accent-strong"),
        )}
      >
        <span className="truncate">{label}</span>
        <span className={cn("shrink-0 text-[0.6875rem] tabular-nums", isSel ? "text-white/80" : "text-bmm-faint")}>
          {count}
        </span>
      </button>
    );
  };

  const renderGroup = (title: string, children: ComponentChildren) => (
    <div className="flex flex-col gap-0.5">
      <div className="px-2.5 pb-1 pt-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-bmm-faint">
        {title}
      </div>
      {children}
    </div>
  );

  return (
    <nav
      aria-label={t("sidebar-category-all")}
      className={cn(
        "flex max-h-[60vh] shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-bmm-border bg-bmm-surface p-2.5 shadow-bmm-card",
        "w-full sm:w-56 lg:w-60",
      )}
    >
      {/* Pinned top categories: All + Recommend */}
      <div className="flex flex-col gap-0.5">
        {renderItem({ type: "all" }, t("sidebar-category-all"), allCount, true)}
        {renderItem({ type: "recommend" }, `${t("sidebar-category-recommend")} ♥️`, recommendCount, true)}
      </div>

      {/* Tags group */}
      {tags.length > 0 &&
        renderGroup(
          t("sidebar-group-tags"),
          tags.map((tag) =>
            renderItem(
              { type: "tag", value: tag },
              tag,
              availableMods.filter((m) => m.addon.tags?.includes(tag)).length,
            ),
          ),
        )}

      {/* Registries group */}
      {sortedRegistryIds.length > 0 &&
        renderGroup(
          t("sidebar-group-registries"),
          sortedRegistryIds.map((id) =>
            renderItem({ type: "registry", value: id }, getRegistryLabel(id, registries), registryCounts.get(id) || 0),
          ),
        )}
    </nav>
  );
}
