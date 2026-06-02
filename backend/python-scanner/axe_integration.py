import os
import re
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


def element_label_from_axe_node(node: Dict[str, Any], selector: str) -> str:
    html = node.get("html")
    if isinstance(html, str) and html.strip():
        return re.sub(r"\s+", " ", html.strip())[:220]
    return selector or "Page Element"


def axe_nodes_to_table_items(rule: Dict[str, Any], limit: int = 50) -> List[Dict[str, Any]]:
    nodes = rule.get("nodes", []) if isinstance(rule.get("nodes"), list) else []
    rule_id = rule.get("id", "axe-violation")
    impact = rule.get("impact") or "unknown"
    tags = rule.get("tags", []) if isinstance(rule.get("tags"), list) else []
    items = []
    for node in nodes[:limit]:
        selector = selector_from_axe_node(node)
        element_label = element_label_from_axe_node(node, selector)
        items.append({
            "ruleId": rule_id,
            "impact": impact,
            "axeTags": tags,
            "node": {
                "nodeLabel": element_label,
                "selector": selector,
                "path": selector,
            },
            "selector": selector,
            "html": node.get("html"),
            "target": node.get("target"),
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
                {"key": "ruleId", "itemType": "text", "text": "Rule ID"},
                {"key": "impact", "itemType": "text", "text": "Impact"},
                {"key": "selector", "itemType": "code", "text": "Selector"},
                {"key": "explanation", "itemType": "text", "text": "Failure"},
            ],
            "items": axe_nodes_to_table_items(rule),
        } if nodes else None,
        "axeImpact": rule.get("impact"),
        "axeTags": rule.get("tags", []),
        "helpUrl": rule.get("helpUrl"),
    }


def criterion_from_axe_tag(tag: str) -> Optional[str]:
    match = re.match(r"^wcag(\d)(\d)(\d{1,2})$", tag)
    if not match:
        return None

    return f"{match.group(1)}.{match.group(2)}.{int(match.group(3))}"


def wcag_criteria_from_rule(rule: Dict[str, Any]) -> List[str]:
    tags = rule.get("tags", []) if isinstance(rule.get("tags"), list) else []
    criteria = []
    for tag in tags:
        criterion = criterion_from_axe_tag(str(tag))
        if criterion and criterion not in criteria:
            criteria.append(criterion)
    return criteria


def build_wcag_rule_entry(rule: Dict[str, Any], status: str) -> Dict[str, Any]:
    nodes = rule.get("nodes", []) if isinstance(rule.get("nodes"), list) else []
    return {
        "id": rule.get("id"),
        "help": rule.get("help") or rule.get("description") or rule.get("id"),
        "description": rule.get("description"),
        "impact": rule.get("impact") or "none",
        "helpUrl": rule.get("helpUrl"),
        "status": status,
        "nodeCount": len(nodes),
    }


def build_axe_wcag_summary(axe_results: Dict[str, Any]) -> Dict[str, Any]:
    result_groups = {
        "passed": axe_results.get("passes", []) if isinstance(axe_results.get("passes"), list) else [],
        "failed": axe_results.get("violations", []) if isinstance(axe_results.get("violations"), list) else [],
        "incomplete": axe_results.get("incomplete", []) if isinstance(axe_results.get("incomplete"), list) else [],
    }
    criteria: Dict[str, Dict[str, Any]] = {}

    for status, rules in result_groups.items():
        for rule in rules:
            for criterion in wcag_criteria_from_rule(rule):
                if criterion not in criteria:
                    criteria[criterion] = {
                        "criterion": criterion,
                        "passedRules": 0,
                        "failedRules": 0,
                        "incompleteRules": 0,
                        "failedElementCount": 0,
                        "incompleteElementCount": 0,
                        "rules": [],
                    }

                entry = criteria[criterion]
                rule_entry = build_wcag_rule_entry(rule, status)
                entry["rules"].append(rule_entry)

                if status == "passed":
                    entry["passedRules"] += 1
                elif status == "failed":
                    entry["failedRules"] += 1
                    entry["failedElementCount"] += rule_entry["nodeCount"]
                elif status == "incomplete":
                    entry["incompleteRules"] += 1
                    entry["incompleteElementCount"] += rule_entry["nodeCount"]

    for entry in criteria.values():
        tested_rules = entry["passedRules"] + entry["failedRules"] + entry["incompleteRules"]
        entry["testedRules"] = tested_rules
        entry["passRate"] = round((entry["passedRules"] / tested_rules) * 100, 1) if tested_rules else None

    criteria_list = sorted(criteria.values(), key=lambda item: [int(part) for part in item["criterion"].split(".")])
    total_rules = sum(item["testedRules"] for item in criteria_list)
    passed_rules = sum(item["passedRules"] for item in criteria_list)
    failed_rules = sum(item["failedRules"] for item in criteria_list)
    incomplete_rules = sum(item["incompleteRules"] for item in criteria_list)

    return {
        "engine": "axe-core",
        "scope": "automated",
        "note": "Includes only WCAG success criteria that axe-core returned as passed, failed, or incomplete for this page.",
        "criteriaCount": len(criteria_list),
        "testedRuleCount": total_rules,
        "passedRuleCount": passed_rules,
        "failedRuleCount": failed_rules,
        "incompleteRuleCount": incomplete_rules,
        "passRate": round((passed_rules / total_rules) * 100, 1) if total_rules else None,
        "criteria": criteria_list,
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
        "wcagSummary": build_axe_wcag_summary(axe_results),
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
