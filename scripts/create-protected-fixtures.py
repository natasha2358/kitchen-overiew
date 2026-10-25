"""Optional fixture regeneration with pypdf 6.10.0; no original receipt input."""
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions
root = Path(__file__).resolve().parent.parent / "tests/fixtures/receipts"
for name, password in [("rewe-style-readable-protected.pdf", ""), ("password-required.pdf", "fixture-opening-password")]:
    writer = PdfWriter()
    for page in PdfReader(root / "rewe-style-fictional.pdf").pages:
        writer.add_page(page)
    writer.add_metadata({"/Title": "Fictional protected receipt fixture"})
    writer.encrypt(user_password=password, owner_password="fixture-owner-password", permissions_flag=UserAccessPermissions.PRINT | UserAccessPermissions.EXTRACT, algorithm="RC4-128")
    writer.write(root / name)
