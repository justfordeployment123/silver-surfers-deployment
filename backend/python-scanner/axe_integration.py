import os
from typing import Any, Dict, List, Optional

from scanner_config import FULL_AUDIT_REFS, LITE_AUDIT_REFS


def find_axe_core_script() -> Optional[str]:
    candidates = [
        os.getenv("AXE_CORE_PATH"),
        os.path.join(os.getcwd(), "node_modules", "axe-core", "axe.min.js"),
        os.path.join(os.getcwd(), "node_modules", ".pnpm", "axe-core@4.11.2", "node_modules", "axe-core", "axe.min.js"),
        os.path.join(os.path.dirname(os.getcwd()), "backend", "node_modules", "axe-core", "axe.min.js"),
    ]

    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate

    node_modules = os.path.join(os.getcwd(), "node_modules", ".pnpm")
    if os.path.isdir(node_modules):
        for entry in os.listdir(node_modules):
            candidate = os.path.join(node_modules, entry, "node_modules", "axe-core", "axe.min.js")
            if entry.startswith("axe-core@") and os.path.exists(candidate):
                return candidate

    return None


def selector_from_axe_node(node: Dict[str, Any]) -> str:
    target = node.get("target")
    if isinstance(target, list) and target:
        return str(target[0])
    if isinstance(target, str):
        return target
    return "unknown"


def axe_nodes_to_table_items(nodes: List[Dict[str, Any]], limit: int = 50) -> List[Dict[str, Any]]:
    items = []
    for node in nodes[:limit]:
        selector = selector_from_axe_node(node)
        items.append({
            "node": {
                "nodeLabel": node.get("failureSummary") or node.get("html") or selector,
                "selector": selector,
                "path": selector,
            },
            "selector": selector,
            "explanation": node.get("failureSummary") or "Element failed axe-core accessibility rule.",
        })
    return items


def build_audit_from_axe_rule(rule: Dict[str, Any]) -> Dict[str, Any]:
    nodes = rule.get("nodes", []) if isinstance(rule.get("nodes"), list) else []
    return {
        "id": rule.get("id", "axe-violation"),
        "title": rule.get("help") or rule.get("description") or rule.get("id", "axe-core violation"),
        "description": rule.get("description") or rule.get("help") or "axe-core accessibility rule result.",
        "score": 0.0 if nodes else 1.0,
        "scoreDisplayMode": "binary",
        "displayValue": f"{len(nodes)} failing element{'s' if len(nodes) != 1 else ''}",
        "details": {
            "type": "table",
            "headings": [
                {"key": "node", "itemType": "node", "text": "Element"},
                {"key": "selector", "itemType": "code", "text": "Selector"},
                {"key": "explanation", "itemType": "text", "text": "Failure"},
            ],
            "items": axe_nodes_to_table_items(nodes),
        } if nodes else None,
        "axeImpact": rule.get("impact"),
        "axeTags": rule.get("tags", []),
        "helpUrl": rule.get("helpUrl"),
    }


def merge_axe_results_into_audits(audits: Dict[str, Any], axe_results: Dict[str, Any]) -> None:
    violations = axe_results.get("violations", []) if isinstance(axe_results, dict) else []
    passes = axe_results.get("passes", []) if isinstance(axe_results, dict) else []
    violation_by_id = {rule.get("id"): rule for rule in violations if rule.get("id")}
    pass_ids = {rule.get("id") for rule in passes if rule.get("id")}

    canonical_rule_ids = {
        "color-contrast",
        "target-size",
        "link-name",
        "button-name",
        "label",
        "heading-order",
        "image-alt",
        "bypass",
        "html-has-lang",
        "document-title",
        "aria-allowed-attr",
        "aria-required-attr",
        "aria-valid-attr",
        "aria-valid-attr-value",
    }

    for rule_id in canonical_rule_ids:
        if rule_id in violation_by_id:
            audits[rule_id] = build_audit_from_axe_rule(violation_by_id[rule_id])
        elif rule_id in pass_ids and rule_id in audits:
            existing_score = audits[rule_id].get("score")
            if isinstance(existing_score, (int, float)) and existing_score < 1.0:
                audits[rule_id] = {
                    **audits[rule_id],
                    "description": f"{audits[rule_id].get('description', '')} axe-core did not report this rule as a violation.".strip(),
                }
                continue
            audits[rule_id] = {
                **audits[rule_id],
                "score": 1.0,
                "numericValue": 1.0,
                "scoreDisplayMode": "binary",
                "description": f"{audits[rule_id].get('description', '')} Verified by axe-core.".strip(),
            }

    for rule in violations:
        rule_id = rule.get("id")
        if not rule_id:
            continue
        axe_audit_id = f"axe-{rule_id}"
        audits[axe_audit_id] = build_audit_from_axe_rule({**rule, "id": axe_audit_id})

    audits["axe-core"] = {
        "id": "axe-core",
        "title": "axe-core WCAG accessibility scan",
        "description": "Runs axe-core against the Camoufox-loaded page using WCAG and best-practice rule tags.",
        "score": 1.0 if not violations else max(0.0, 1 - min(len(violations), 20) / 20),
        "numericValue": len(violations),
        "displayValue": f"{len(violations)} axe violation rule{'s' if len(violations) != 1 else ''}",
        "details": {
            "type": "table",
            "headings": [
                {"key": "rule", "itemType": "text", "text": "Rule"},
                {"key": "impact", "itemType": "text", "text": "Impact"},
                {"key": "count", "itemType": "numeric", "text": "Elements"},
                {"key": "help", "itemType": "text", "text": "Help"},
            ],
            "items": [
                {
                    "rule": rule.get("id"),
                    "impact": rule.get("impact") or "unknown",
                    "count": len(rule.get("nodes", []) or []),
                    "help": rule.get("help") or rule.get("description"),
                }
                for rule in violations
            ],
        },
    }


def make_not_checked_audit(audit_id: str, title: str, reason: str) -> Dict[str, Any]:
    return {
        "id": audit_id,
        "title": title,
        "description": reason,
        "score": None,
        "scoreDisplayMode": "notChecked",
        "notChecked": True,
        "displayValue": "Not checked automatically",
    }


def ensure_expected_audits(audits: Dict[str, Any], is_lite: bool) -> None:
    expected_refs = LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS
    expected_ids = {ref["id"] for ref in expected_refs}
    not_checked_reasons = {
        "focus-traps": (
            "Keyboard focus traps cannot be reliably certified by axe-core's static rules. "
            "This requires a dynamic keyboard journey through menus, modals, and widgets and should be manually verified."
        ),
    }

    for audit_id in expected_ids:
        if audit_id in audits:
            continue

        if audit_id in not_checked_reasons:
            audits[audit_id] = make_not_checked_audit(
                audit_id,
                "Keyboard focus is not trapped",
                not_checked_reasons[audit_id],
            )
        else:
            audits[audit_id] = make_not_checked_audit(
                audit_id,
                audit_id,
                f"The scanner did not produce a result for {audit_id}. This audit is excluded from scoring until implemented.",
            )
