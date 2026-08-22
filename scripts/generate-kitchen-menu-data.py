#!/usr/bin/env python3
"""Build the Kitchen dinner menu dataset from the two approved training PDFs."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PRODUCT_PDF = Path("/Users/hamedtavanapour/Desktop/Keg/servicenproductknowledge/Product Knowledge - Dinner - CAN - March 2026.pdf")
COOK_PDF = Path("/Users/hamedtavanapour/Desktop/Keg/servicenproductknowledge/COOK AND PRESENT- ENGLISH - May 2026.pdf")
DATA_FILE = ROOT / "apps/web/public/legacy/js/data/kitchen-menu-may-2026.js"
IMAGE_DIR = ROOT / "apps/web/public/legacy/assets/menu/kitchen-dinner-may-2026"


ITEMS = [
    ("Starters", "Baked Brie", 14), ("Starters", "Baked Garlic Shrimp", 16),
    ("Starters", "Beef Tartare (Quebec Only)", 17), ("Starters", "Calamari", 19),
    ("Starters", "Escargot", 20), ("Starters", "French Onion Soup", 21),
    ("Starters", "Garlic Cheese Toast", 22), ("Starters", "Mushrooms Neptune", 23),
    ("Starters", "Scallops & Bacon", 24), ("Starters", "Shrimp Cocktail", 25),
    ("Starters", "Smoked Gouda Spinach Dip", 26), ("Starters", "Three Pepper Wings", 27),
    ("Starters", "Tuna Tartare", 28),
    ("Salads", "Caesar", 30), ("Salads", "Iceberg Wedge", 31),
    ("Salads", "Mixed Greens", 32), ("Salads", "Side Caesar", 33),
    ("Salads", "Side Iceberg Wedge", 34), ("Salads", "Side Mixed Greens", 35),
    ("Mains", "BBQ Pork Ribs", 36), ("Mains", "Mushroom Risotto", 37),
    ("Burgers & Bar", "Keg Burger", 38), ("Burgers & Bar", "Nachos", 40),
    ("Burgers & Bar", "Prime Rib Sandwich", 42), ("Burgers & Bar", "Prime Rib Sliders", 44),
    ("Accompaniments", "Mushroom Rice", 54), ("Accompaniments", "Baked Potato", 55),
    ("Accompaniments", "Fries", 56), ("Accompaniments", "Seasonal Vegetables", 57),
    ("Accompaniments", "Garlic Mashed Potatoes", 58), ("Accompaniments", "Side Order of Keg Fries", 59),
    ("Accompaniments", "Truffle Fries (Accompaniment)", 60), ("Accompaniments", "Twice Baked Potato", 61),
    ("Classic Dinners", "Baseball Classic", 62), ("Classic Dinners", "Filet Classic 7 + 10", 63),
    ("Classic Dinners", "New York Classic", 64), ("Classic Dinners", "Prime Rib Classic", 65),
    ("Classic Dinners", "Sirloin Classic", 66), ("Classic Dinners", "Teriyaki Sirloin Classic", 67),
    ("Steaks & Prime Rib", "Baseball Sirloin", 68), ("Steaks & Prime Rib", "Bleu Cheese Filet", 69),
    ("Steaks & Prime Rib", "Bone-In Rib Steak", 70), ("Steaks & Prime Rib", "Filet 7oz + 10oz", 71),
    ("Steaks & Prime Rib", "New York", 72), ("Steaks & Prime Rib", "Peppercorn New York", 73),
    ("Steaks & Prime Rib", "Prime Rib", 74), ("Steaks & Prime Rib", "Sirloin 6oz + 8oz", 76),
    ("Steaks & Prime Rib", "Steak Platter", 77), ("Steaks & Prime Rib", "Teriyaki Sirloin", 79),
    ("Steak & Seafood", "Sirloin Oscar 6 + 8", 80), ("Steak & Seafood", "Steak & Snow Crab 6oz + 8oz", 82),
    ("Steak & Seafood", "Steak & Lobster 6oz + 8oz", 83),
    ("Shareable Sides", "Caesar Brussels Sprouts", 84), ("Shareable Sides", "Keg Mac + Cheese", 85),
    ("Shareable Sides", "Truffle Fries", 86), ("Shareable Sides", "Onion Rings", 87),
    ("Shareable Sides", "Broccoli Gratin", 88),
    ("Add to Your Steak", "Add Béarnaise to Any Steak", 89),
    ("Add to Your Steak", "Add Blue Cheese Crust to Any Steak", 90),
    ("Add to Your Steak", "Add Confit Garlic Butter to Any Steak", 91),
    ("Add to Your Steak", "Add Lobster Tail to Any Steak", 92),
    ("Add to Your Steak", "Add Shrimp Skewer to Any Steak", 93),
    ("Add to Your Steak", "Add Whiskey Peppercorn to Any Steak", 94),
    ("Fish", "Honey Mustard Salmon", 95), ("Fish", "Pistachio Salmon", 97),
    ("Fish", "Two Tail Dinner", 99), ("Chicken", "Blackened Chicken", 100),
    ("Chicken", "Mushroom and Truffle Chicken", 102),
    ("Add-ons", "Hot Creamy Butter", 103), ("Add-ons", "Warm Bread", 104),
    ("Garnish & Plating", "Garnish Summary", 105),
    ("Garnish & Plating", "Sautéed Mixed Mushrooms", 106),
    ("Garnish & Plating", "Plate Vegetables", 107),
    ("Desserts", "Billy Miner Pie", 108), ("Desserts", "Cheesecake", 109),
    ("Desserts", "Crème Brule", 110), ("Desserts", "Dessert Platter", 111),
    ("Desserts", "Seasonal Sorbet", 113),
    ("Kids Menu", "Kids Burger", 114), ("Kids Menu", "Kids Chicken Strips", 115),
    ("Kids Menu", "Kids Creamy Pasta", 116), ("Kids Menu", "Kids Ice Cream", 117),
    ("Kids Menu", "Kids Plate", 118), ("Kids Menu", "Kids Sirloin", 119),
]


PRODUCT_ITEMS = {
    1: ["MUSHROOMS NEPTUNE", "SHRIMP COCKTAIL", "BAKED GARLIC SHRIMP", "SCALLOPS & BACON", "CALAMARI", "ESCARGOT"],
    2: ["GARLIC CHEESE TOAST", "TUNA TARTARE", "BAKED BRIE", "CRAB CAKES", "SMOKED GOUDA SPINACH DIP", "BEEF TARTARE"],
    3: ["KEG CAESAR", "ICEBERG WEDGE", "MIXED GREENS", "FRENCH ONION SOUP"],
    4: ["PRIME RIB", "GRILLED TOP SIRLOIN", "TERIYAKI SIRLOIN", "FILET MIGNON", "BASEBALL SIRLOIN"],
    5: ["NEW YORK", "PEPPERCORN NEW YORK", "BLUE CHEESE FILET", "RIB STEAK", "KEG STEAK PLATTER"],
    6: ["SIRLOIN OSCAR", "SIRLOIN & LOBSTER", "SIRLOIN & CRAB"],
    7: ["SIRLOIN / TERIYAKI CLASSIC", "FILET CLASSIC", "NEW YORK CLASSIC", "PRIME RIB CLASSIC", "BASEBALL SIRLOIN CLASSIC"],
    8: ["ATLANTIC LOBSTER TAIL", "SHRIMP & SCALLOP OSCAR", "GRILLED JUMBO SHRIMP", "SNOW CRAB CLUSTER", "WHISKEY PEPPERCORN", "BEARNAISE"],
    9: ["PISTACHIO CRUSTED SALMON", "HONEY MUSTARD GLAZED SALMON", "LOBSTER TAIL DINNER", "BLACKENED CHICKEN", "KEG BURGER"],
    10: ["PRIME RIB SANDWICH", "MUSHROOM RISOTTO", "MUSHROOM TRUFFLE CHICKEN", "BBQ PORK RIBS"],
    11: ["CAESAR BRUSSELS SPROUTS", "BROCCOLI GRATIN", "SAUTEED MUSHROOMS", "ONION RINGS", "KEG MAC + CHEESE"],
    12: ["PRIME RIB SLIDERS", "THREE PEPPER WINGS", "LOADED NACHOS"],
    13: ["KID'S SIRLOIN", "KID'S CHICKEN STRIPS", "KID'S BURGER", "KID'S CHEESY NOODLES", "KIDS PLATE"],
    14: ["BILLY MINER PIE", "CHEESECAKE", "CRÈME BRULEE", "KID'S ICE CREAM"],
    15: ["KEG DESSERT PLATTER", "SEASONAL SORBET"],
    16: ["GARLIC MASHED POTATOES", "BAKED POTATO", "TWICE BAKED POTATOES", "MUSHROOM RICE", "KEG FRIES", "MIXED VEGETABLES"],
    17: ["WARM BREAD", "FRIZZLED ONIONS", "PLATE VEGETABLES"],
}


ALIASES = {
    "Beef Tartare (Quebec Only)": "BEEF TARTARE", "Crème Brule": "CRÈME BRULEE",
    "Caesar": "KEG CAESAR", "Side Caesar": "KEG CAESAR",
    "Side Iceberg Wedge": "ICEBERG WEDGE", "Side Mixed Greens": "MIXED GREENS",
    "Nachos": "LOADED NACHOS", "Fries": "KEG FRIES", "Side Order of Keg Fries": "KEG FRIES",
    "Seasonal Vegetables": "MIXED VEGETABLES", "Twice Baked Potato": "TWICE BAKED POTATOES",
    "Baseball Classic": "BASEBALL SIRLOIN CLASSIC", "Filet Classic 7 + 10": "FILET CLASSIC",
    "Sirloin Classic": "SIRLOIN / TERIYAKI CLASSIC", "Teriyaki Sirloin Classic": "SIRLOIN / TERIYAKI CLASSIC",
    "Bleu Cheese Filet": "BLUE CHEESE FILET", "Bone-In Rib Steak": "RIB STEAK",
    "Filet 7oz + 10oz": "FILET MIGNON", "Sirloin 6oz + 8oz": "GRILLED TOP SIRLOIN",
    "Steak Platter": "KEG STEAK PLATTER", "Sirloin Oscar 6 + 8": "SIRLOIN OSCAR",
    "Steak & Snow Crab 6oz + 8oz": "SIRLOIN & CRAB", "Steak & Lobster 6oz + 8oz": "SIRLOIN & LOBSTER",
    "Sautéed Mixed Mushrooms": "SAUTEED MUSHROOMS", "Add Béarnaise to Any Steak": "BEARNAISE",
    "Add Lobster Tail to Any Steak": "ATLANTIC LOBSTER TAIL", "Add Shrimp Skewer to Any Steak": "GRILLED JUMBO SHRIMP",
    "Add Whiskey Peppercorn to Any Steak": "WHISKEY PEPPERCORN", "Honey Mustard Salmon": "HONEY MUSTARD GLAZED SALMON",
    "Pistachio Salmon": "PISTACHIO CRUSTED SALMON", "Two Tail Dinner": "LOBSTER TAIL DINNER",
    "Mushroom and Truffle Chicken": "MUSHROOM TRUFFLE CHICKEN", "Dessert Platter": "KEG DESSERT PLATTER",
    "Kids Burger": "KID'S BURGER", "Kids Chicken Strips": "KID'S CHICKEN STRIPS",
    "Kids Creamy Pasta": "KID'S CHEESY NOODLES", "Kids Ice Cream": "KID'S ICE CREAM",
    "Kids Plate": "KIDS PLATE", "Kids Sirloin": "KID'S SIRLOIN",
}


def run_text(pdf: Path, first: int, last: int) -> str:
    proc = subprocess.run(
        ["pdftotext", "-f", str(first), "-l", str(last), "-layout", str(pdf), "-"],
        check=True, capture_output=True, text=True,
    )
    return proc.stdout.replace("\f", "\n")


def clean_text(value: str) -> str:
    value = value.replace("`", "")
    lines = []
    for raw in value.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line or re.fullmatch(r"Page \d+", line) or line == "May 2026":
            continue
        if "Recipe continues on the next page" in line:
            continue
        lines.append(line)
    value = "\n".join(lines)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def strip_page_noise(text: str, name: str) -> str:
    text = re.sub(rf"^\s*{re.escape(name)}(?:\.{3}|\s+Cont'?d|\s+-).*?$", "", text, flags=re.I | re.M)
    text = re.sub(r"^\s*Page\s+\d+.*?May 2026\s*$", "", text, flags=re.I | re.M)
    text = re.sub(r"Recipe continues on the next page\.?", "", text, flags=re.I)
    return text


def split_cook_sections(name: str, start: int, end: int) -> dict:
    page_texts = [strip_page_noise(run_text(COOK_PDF, page, page), name) for page in range(start, end + 1)]
    combined = "\n".join(page_texts)
    ingredient_match = re.search(r"Ingredients:\s*(.*?)\s*Flatware:", combined, re.S | re.I)
    ingredients = []
    if ingredient_match:
        for line in ingredient_match.group(1).splitlines():
            line = line.strip()
            if not line:
                continue
            parts = re.split(r"\s{2,}", line, maxsplit=1)
            ingredient_name = parts[0].strip()
            amount = parts[1].strip() if len(parts) > 1 else ""
            if amount and ingredient_name and not ingredient_name.lower().startswith(("page ", "recipe continues")):
                ingredients.append({"name": ingredient_name, "amount": amount})

    flatware_match = re.search(r"Flatware:\s*(.*?)(?=\s+Note:|\s+Cooking:|\s+Plating:|\s+Recipe continues|\s+Page\s+\d+)", combined, re.S | re.I)
    note_match = re.search(r"Note:\s*(.*?)(?=\s+Cooking:|\s+Plating:|\s+Recipe continues|\s+Page\s+\d+)", combined, re.S | re.I)

    cooking_parts, plating_parts = [], []
    current_section = ""
    for page_text in page_texts:
        cooking_at = re.search(r"\bCooking:\s*", page_text, re.I)
        plating_at = re.search(r"\bPlating:\s*", page_text, re.I)
        if cooking_at:
            stop = plating_at.start() if plating_at and plating_at.start() > cooking_at.end() else len(page_text)
            cooking_parts.append(page_text[cooking_at.end():stop])
            current_section = "cooking"
        elif plating_at:
            prefix = page_text[:plating_at.start()]
            prefix = re.sub(r"^.*?(?:Cont'?d|\.\.\.\s*Cont'?d)\s*", "", prefix, flags=re.I | re.S)
            if re.search(r"\b\d+\.\s", prefix):
                (plating_parts if current_section == "plating" else cooking_parts).append(prefix)
        elif current_section and re.search(r"\b\d+\.\s", page_text):
            body = re.sub(r"^.*?\n", "", page_text, count=1)
            (plating_parts if current_section == "plating" else cooking_parts).append(body)
        if plating_at:
            plating_parts.append(page_text[plating_at.end():])
            current_section = "plating"

    return {
        "ingredients": ingredients,
        "equipment": clean_text(flatware_match.group(1) if flatware_match else ""),
        "kitchenNotes": clean_text(note_match.group(1) if note_match else ""),
        "cookingInstructions": clean_text("\n".join(cooking_parts)),
        "platingInstructions": clean_text("\n".join(plating_parts)),
    }


def product_blocks() -> dict[str, dict]:
    blocks = {}
    for page, names in PRODUCT_ITEMS.items():
        lines = run_text(PRODUCT_PDF, page, page).splitlines()
        starts = []
        for name in names:
            wanted = re.sub(r"[^A-Z0-9]+", "", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().upper())
            found = None
            for idx in range(len(lines)):
                left = " ".join(line[:39] for line in lines[idx:idx + 3])
                candidate = re.sub(r"[^A-Z0-9]+", "", unicodedata.normalize("NFKD", left).encode("ascii", "ignore").decode().upper())
                if candidate.startswith(wanted):
                    found = idx
                    break
            if found is not None:
                starts.append((found, name))
        starts.sort()
        for pos, (start, name) in enumerate(starts):
            end = starts[pos + 1][0] if pos + 1 < len(starts) else len(lines)
            chunk = lines[start:end]
            description_lines, presentation_lines, cook_time, accompaniment = [], [], "", ""
            for line in chunk:
                left = line[:39].strip()
                middle = line[39:113].strip()
                right = line[113:].strip()
                if left.lower().startswith("cook time"):
                    cook_time = re.sub(r"^Cook Time:\s*", "", left, flags=re.I).strip()
                if middle.lower().startswith("accompanied by:"):
                    accompaniment = re.sub(r"^Accompanied By:\s*", "", middle, flags=re.I).strip()
                elif middle and "Product Knowledge - Dinner" not in middle:
                    description_lines.append(middle)
                if right:
                    if accompaniment and not presentation_lines and not re.match(r"^(Served|The |A |Garnish|Butter|Seafood|This |All |Veggie|Ice cream|Kid|To be|\*)", right):
                        accompaniment = f"{accompaniment} {right}".strip()
                    else:
                        presentation_lines.append(right)
            blocks[name] = {
                "productKnowledge": clean_text(" ".join(description_lines)),
                "cookTime": cook_time,
                "accompaniment": clean_text(accompaniment),
                "presentation": clean_text(" ".join(presentation_lines)),
                "productKnowledgePage": page,
            }
    return blocks


def slug(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def extract_image(page: int, name: str) -> str:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = IMAGE_DIR / f"{slug(name)}.jpg"
    with tempfile.TemporaryDirectory(prefix="kitchen-menu-image-") as temp_dir:
        prefix = Path(temp_dir) / "image"
        subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-j", str(COOK_PDF), str(prefix)], check=True, capture_output=True)
        candidates = []
        for file in Path(temp_dir).glob("image-*"):
            if file.suffix.lower() not in {".jpg", ".jpeg"}:
                continue
            try:
                with Image.open(file) as image:
                    width, height = image.size
                    ratio = max(width, height) / max(1, min(width, height))
                    if width >= 300 and height >= 220 and ratio < 4:
                        candidates.append((width * height, file))
            except Exception:
                pass
        if candidates:
            source = max(candidates)[1]
            if source.suffix.lower() in {".jpg", ".jpeg"}:
                shutil.copy2(source, target)
            else:
                with Image.open(source) as image:
                    image.convert("RGB").save(target, "JPEG", quality=100, subsampling=0)
        else:
            render_prefix = Path(temp_dir) / "page"
            subprocess.run([
                "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
                "-jpeg", "-r", "200", str(COOK_PDF), str(render_prefix),
            ], check=True, capture_output=True)
            shutil.copy2(render_prefix.with_suffix(".jpg"), target)
    return f"/legacy/assets/menu/kitchen-dinner-may-2026/{target.name}?v=kitchen-dinner-3"


def build() -> list[dict]:
    if not PRODUCT_PDF.exists() or not COOK_PDF.exists():
        raise SystemExit("Both source PDFs must be available at their approved source paths.")
    if IMAGE_DIR.exists():
        shutil.rmtree(IMAGE_DIR)
    knowledge = product_blocks()
    result = []
    for index, (category, name, start) in enumerate(ITEMS):
        end = (ITEMS[index + 1][2] - 1) if index + 1 < len(ITEMS) else 119
        cook = split_cook_sections(name, start, end)
        source_name = ALIASES.get(name, name.upper())
        product = knowledge.get(source_name, {})
        result.append({
            "name": name,
            "category": category,
            "imageUrl": extract_image(start, name),
            "ingredients": cook["ingredients"],
            "productKnowledge": product.get("productKnowledge", ""),
            "cookTime": product.get("cookTime", ""),
            "cookingInstructions": cook["cookingInstructions"],
            "platingInstructions": cook["platingInstructions"],
            "presentation": product.get("presentation", ""),
            "accompaniment": product.get("accompaniment", ""),
            "equipment": cook["equipment"],
            "kitchenNotes": cook["kitchenNotes"],
            "contentAccessKeys": {
                "image": "kitchen.image", "productKnowledge": "kitchen.overview",
                "ingredients": "kitchen.ingredients", "cookingInstructions": "kitchen.cooking",
                "platingInstructions": "kitchen.plating", "presentation": "kitchen.presentation",
                "accompaniment": "kitchen.service", "equipment": "kitchen.service",
                "kitchenNotes": "kitchen.notes",
            },
            "sourcePages": {
                "cookAndPresent": f"{start}-{end}" if start != end else str(start),
                "productKnowledge": str(product.get("productKnowledgePage", "")),
            },
            "source": "COOK AND PRESENT - ENGLISH - May 2026 + Product Knowledge - Dinner - CAN - March 2026",
        })
    return result


def main() -> None:
    items = build()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(items, ensure_ascii=False, indent=2)
    DATA_FILE.write_text(
        "// Generated from the approved Kitchen training manuals. Keep the fields separate for future access rules.\n"
        f"globalThis.KITCHEN_MENU_MAY_2026={payload};\n",
        encoding="utf-8",
    )
    print(f"Generated {len(items)} Kitchen items and {len(list(IMAGE_DIR.glob('*.jpg')))} images.")


if __name__ == "__main__":
    main()
