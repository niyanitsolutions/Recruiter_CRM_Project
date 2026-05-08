"""
Niyan HireFlow CRM — Professional PDF Generator (v3 — flat layout, no missing content)
"""
import re, os, subprocess, sys, markdown

# Force UTF-8 output on Windows so Unicode symbols print cleanly
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MD_FILE   = "NIYAN_HIREFLOW_PRODUCT_DOCUMENT.md"
HTML_FILE = "NIYAN_HIREFLOW_CRM_Brochure.html"
PDF_FILE  = "NIYAN_HIREFLOW_CRM_Product_Brochure.pdf"

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

# ─────────────────────────────────────────────────────────────────────────────
CSS = r"""
* { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --primary:  #6C63FF;
  --accent:   #4FACFE;
  --green:    #43E97B;
  --gold:     #F6D365;
  --danger:   #FF4757;
  --bg:       #0F0E1A;
  --bg2:      #14112A;
  --bg3:      #1A1830;
  --card:     #1E1B33;
  --card2:    #252140;
  --border:   #2D2A50;
  --border2:  #3A3660;
  --txt:      #DDD9F5;
  --txt2:     #A8A4D4;
  --txt3:     #6E6A9A;
}

/* ── PAGE SETUP ─────────────────────────────────────────────────────────── */
@page          { size: A4; margin: 0; }
@page content  { size: A4; margin: 14mm 18mm 16mm; }

html { font-size: 11px; }

body {
  font-family: 'Segoe UI', 'Inter', Arial, sans-serif;
  background: var(--bg);
  color: var(--txt);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── COVER ──────────────────────────────────────────────────────────────── */
.cover {
  width: 210mm;
  min-height: 297mm;
  background: linear-gradient(150deg, #08071A 0%, #130F2D 30%, #1C183C 60%, #0F0E1A 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 60px;
  page-break-after: always;
  position: relative;
  overflow: hidden;
}
.cg1 { position:absolute;top:-80px;right:-80px;width:420px;height:420px;border-radius:50%;
        background:radial-gradient(circle,rgba(108,99,255,.22)0%,transparent 70%); }
.cg2 { position:absolute;bottom:-100px;left:-60px;width:360px;height:360px;border-radius:50%;
        background:radial-gradient(circle,rgba(79,172,254,.14)0%,transparent 70%); }
.cg3 { position:absolute;top:50%;right:12%;width:180px;height:180px;border-radius:50%;
        background:radial-gradient(circle,rgba(67,233,123,.08)0%,transparent 70%); }
.c-z { position:relative; z-index:2; }

.c-pill {
  background: linear-gradient(135deg,rgba(108,99,255,.22),rgba(79,172,254,.12));
  border: 1px solid rgba(108,99,255,.45);
  border-radius: 50px;
  padding: 7px 22px;
  font-size: 7.5px; font-weight:700; letter-spacing:3.5px; text-transform:uppercase;
  color: #B0ABFF; margin-bottom:38px;
}
.c-icon {
  width:88px;height:88px;border-radius:22px;
  background:linear-gradient(135deg,#6C63FF,#4FACFE);
  display:flex;align-items:center;justify-content:center;
  margin-bottom:30px;
  box-shadow:0 18px 56px rgba(108,99,255,.55),0 4px 16px rgba(0,0,0,.4);
  font-size:38px;font-weight:900;color:#fff;
}
.c-name {
  font-size:36px;font-weight:900;color:#fff;
  text-align:center;letter-spacing:-1px;line-height:1.1;margin-bottom:8px;
}
.c-name-g {
  background:linear-gradient(135deg,#9C96FF,#4FACFE,#43E97B);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.c-tag  { font-size:12px;color:#8A86C0;text-align:center;margin-bottom:36px;font-style:italic;font-weight:300; }
.c-line { width:100px;height:3px;background:linear-gradient(90deg,#6C63FF,#4FACFE,#43E97B);
          border-radius:3px;margin:0 auto 36px; }
.c-desc { font-size:10.5px;color:#B8B4D8;text-align:center;max-width:440px;line-height:1.8;margin-bottom:42px; }

.c-chips { display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:480px;margin-bottom:54px; }
.c-chip  {
  background:rgba(255,255,255,.045);border:1px solid rgba(108,99,255,.28);
  border-radius:9px;padding:10px 14px;font-size:9px;color:#C4C0E0;
  display:flex;align-items:center;gap:9px;
}
.c-chip::before { content:''; width:6px;height:6px;border-radius:50%;
                  background:linear-gradient(135deg,#6C63FF,#4FACFE);flex-shrink:0; }

.c-footer {
  text-align:center;padding-top:30px;
  border-top:1px solid rgba(255,255,255,.07);
  width:100%;max-width:480px;
}
.c-footer p { font-size:7.5px;color:#3E3B68;line-height:2.1; }

/* ── TOC PAGE ───────────────────────────────────────────────────────────── */
.toc-page {
  width:210mm;min-height:297mm;
  background:var(--bg);padding:44px 56px 44px;
  page-break-after:always;
}
.toc-box {
  background:linear-gradient(135deg,#181530,#1E1B38);
  border:1px solid var(--border);border-radius:14px;
  padding:28px 26px;margin-top:22px;
}
.toc-head {
  font-size:9px;font-weight:700;color:#FFFFFF;
  margin-bottom:18px;padding-bottom:12px;
  border-bottom:1px solid var(--border);
  letter-spacing:2px;text-transform:uppercase;
}
.tr { display:flex;align-items:baseline;padding:5.5px 0;border-bottom:1px solid rgba(45,42,80,.45);font-size:9px; }
.tr.m  { margin-top:5px; }
.tr.s  { padding-left:18px; }
.tm    { font-weight:700;color:#C4C0E0; }
.ts    { font-weight:400;color:#8A86C0; }
.td    { flex:1;border-bottom:1px dotted #2D2A50;margin:0 8px;min-width:10px; }
.tp    { color:var(--primary);font-weight:700;font-size:8px;white-space:nowrap; }

.stats-g { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:26px; }
.stat {
  background:linear-gradient(135deg,var(--card),var(--card2));
  border:1px solid var(--border);border-top:3px solid var(--primary);
  border-radius:10px;padding:16px 12px;text-align:center;
}
.sv { font-size:22px;font-weight:900;color:var(--primary);line-height:1; }
.sl { font-size:7px;color:var(--txt3);text-transform:uppercase;letter-spacing:.5px;margin-top:5px; }

/* ── SECTION BREAK ──────────────────────────────────────────────────────── */
.sec-break {
  width: 210mm;
  background: linear-gradient(150deg, #08071A 0%, #14102C 50%, #0F0E1A 100%);
  border-bottom: 3px solid;
  border-image: linear-gradient(90deg,var(--primary),var(--accent),var(--green)) 1;
  padding: 36px 56px 32px;
  display: flex;
  align-items: center;
  gap: 22px;
  page-break-before: always;
  break-before: page;
}
.sn {
  width:52px;height:52px;
  background:linear-gradient(135deg,var(--primary),var(--accent));
  border-radius:14px;display:flex;align-items:center;justify-content:center;
  font-size:19px;font-weight:900;color:#fff;flex-shrink:0;
  box-shadow:0 8px 24px rgba(108,99,255,.45);
}
.sl2 { font-size:7px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--primary);margin-bottom:4px; }
.st  { font-size:21px;font-weight:800;color:#fff;line-height:1.2; }

/* ── CONTENT ────────────────────────────────────────────────────────────── */
.content {
  padding: 38px 56px 46px;
  background: var(--bg);
}

/* Headings */
h1 {
  font-size:19px;font-weight:800;color:#fff;
  margin:30px 0 16px;letter-spacing:-.4px;line-height:1.2;
  page-break-after: avoid;
}
h1:first-child { margin-top:0; }

h2 {
  font-size:13.5px;font-weight:700;color:#fff;
  margin:26px 0 12px;padding-bottom:9px;
  border-bottom:2px solid var(--border);
  position:relative;
  page-break-after: avoid;
}
h2::after {
  content:'';position:absolute;bottom:-2px;left:0;
  width:50px;height:2px;
  background:linear-gradient(90deg,var(--primary),var(--accent));
}

h3 { font-size:11px;font-weight:700;color:#A8A3FF;margin:20px 0 8px; page-break-after:avoid; }
h4 { font-size:8.5px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px; }

p  { margin-bottom:12px;font-size:10.5px;line-height:1.8;color:var(--txt); }

hr {
  border:none;height:1px;
  background:linear-gradient(90deg,transparent,var(--border),transparent);
  margin:22px 0;
}

blockquote {
  margin:14px 0;padding:14px 20px;
  background:linear-gradient(135deg,rgba(108,99,255,.1),rgba(79,172,254,.05));
  border-left:3px solid var(--primary);border-radius:0 8px 8px 0;
}
blockquote p { color:#C4C0E0;font-style:italic;margin:0;font-size:10.5px; }

/* Tables */
table { width:100%;border-collapse:collapse;margin:14px 0 18px;font-size:9px; }
thead tr { background:linear-gradient(135deg,var(--card2),#2D2A50); }
thead th {
  padding:9px 12px;text-align:left;font-weight:700;color:#A8A3FF;
  font-size:8px;letter-spacing:.5px;text-transform:uppercase;
  border-bottom:2px solid var(--primary);
}
tbody tr { border-bottom:1px solid #1E1B38; }
tbody tr:nth-child(odd)  { background:rgba(255,255,255,.018); }
tbody tr:nth-child(even) { background:rgba(108,99,255,.035); }
tbody td { padding:8px 12px;color:var(--txt);vertical-align:top;line-height:1.6; }
tbody td:first-child { font-weight:600;color:#C4C0E0; }

/* Lists */
ul, ol { margin:9px 0 13px; }
li { margin-bottom:4px;line-height:1.7;font-size:10.5px;color:var(--txt); }
ul { list-style:none;padding-left:0; }
ul > li { padding-left:18px;position:relative; }
ul > li::before { content:'▸';color:var(--primary);position:absolute;left:0;font-size:9px;top:2px; }
ul ul > li::before { content:'◦';color:var(--accent); }
ol { padding-left:18px; }

/* Code */
code {
  font-family:'Consolas','Courier New',monospace;
  font-size:8.5px;color:#A8A3FF;
  background:rgba(108,99,255,.12);
  padding:1px 5px;border-radius:3px;
}
pre {
  background:linear-gradient(135deg,#0D0C1A,#14112A);
  border:1px solid var(--border);border-left:3px solid var(--primary);
  border-radius:8px;padding:14px 16px;margin:12px 0 16px;
  page-break-inside:avoid;overflow:hidden;
}
pre code {
  font-size:7.5px;color:#C4C0E0;background:none;padding:0;
  white-space:pre-wrap;word-break:break-all;line-height:1.85;
}

strong { color:#fff;font-weight:700; }
em     { color:#A8A3FF;font-style:italic; }

/* Manual page break */
.pb { page-break-before:always;break-before:page; }

/* Running footer */
.footer {
  position:fixed;bottom:0;left:0;right:0;height:34px;
  background:#09081A;border-top:1px solid #1E1B38;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 56px;font-size:7px;color:var(--txt3);
}
.fb { color:var(--primary);font-weight:700; }
"""

# ─────────────────────────────────────────────────────────────────────────────
def make_cover():
    return """
<div class="cover">
  <div class="cg1"></div><div class="cg2"></div><div class="cg3"></div>
  <div class="c-z c-pill">Product Overview &amp; Feature Brochure</div>
  <div class="c-z c-icon">N</div>
  <div class="c-z c-name">NIYAN <span class="c-name-g">HIREFLOW</span> CRM</div>
  <div class="c-z c-tag">&ldquo;Recruit Smarter. Hire Faster. Grow Together.&rdquo;</div>
  <div class="c-z c-line"></div>
  <div class="c-z c-desc">
    A Complete End-to-End Recruitment &amp; HR Management Platform built for
    Recruitment Agencies, Staffing Firms, HR Consultancies, and Growing Enterprises.
  </div>
  <div class="c-z c-chips">
    <div class="c-chip">Candidate Management</div>
    <div class="c-chip">Interview Automation</div>
    <div class="c-chip">Client &amp; Job Tracking</div>
    <div class="c-chip">Onboarding Workflows</div>
    <div class="c-chip">HR &amp; Payroll Management</div>
    <div class="c-chip">Analytics &amp; Reports</div>
    <div class="c-chip">Partner Management</div>
    <div class="c-chip">AI-Powered Features</div>
  </div>
  <div class="c-z c-footer">
    <p><strong style="color:#8A86C0;">Document Type:</strong> Product Overview &amp; Feature Brochure</p>
    <p><strong style="color:#8A86C0;">Audience:</strong> Clients &nbsp;&middot;&nbsp; Investors &nbsp;&middot;&nbsp; Business Partners &nbsp;&middot;&nbsp; HR Leaders</p>
    <p style="margin-top:10px;">&copy; 2025 Niyan HireFlow &nbsp;&middot;&nbsp; All Rights Reserved &nbsp;&middot;&nbsp; Confidential</p>
  </div>
</div>
"""


def make_toc():
    rows = [
        ("m","1. Cover Page &amp; Introduction","1"),
        ("m","2. About the Product","2"),
        ("s","What Is Niyan HireFlow CRM?","2"),
        ("s","Who Is This Platform For?","2"),
        ("s","Platform Scope at a Glance","3"),
        ("m","3. Problems Businesses Face","4"),
        ("s","7 Critical Pain Points &amp; How We Solve Them","4"),
        ("m","4. Core Modules Overview","6"),
        ("s","Module 1 — Candidate Management","6"),
        ("s","Module 2 — Job Management","7"),
        ("s","Module 3 — Client Management","8"),
        ("s","Module 4 — Application Tracking","8"),
        ("s","Module 5 — Interview Management","9"),
        ("s","Module 6 — Onboarding Management","10"),
        ("s","Module 7 — Partner Management","11"),
        ("s","Module 8 — Human Resource Management (HRM)","12"),
        ("s","Module 9 — Task Management","14"),
        ("s","Module 10 — Analytics &amp; Reports","14"),
        ("s","Module 11 — Import &amp; Export","16"),
        ("s","Module 12 — Notification System","17"),
        ("s","Module 13 — User &amp; Role Management","17"),
        ("s","Module 14 — Security &amp; Compliance","19"),
        ("m","5. Dashboard Analysis","20"),
        ("m","6. Workflow Explanations (5 Workflows)","22"),
        ("m","7. Role-Based Access &amp; Security","26"),
        ("m","8. Reports &amp; Export Features","28"),
        ("m","9. Automation &amp; Smart Features","30"),
        ("m","10. UI/UX Experience","32"),
        ("m","11. Technical Architecture","33"),
        ("m","12. Why Choose Niyan HireFlow CRM","34"),
        ("m","13. Unique Selling Points (10 USPs)","35"),
        ("m","14. Future Scalability","37"),
        ("m","15. Conclusion","38"),
        ("m","16. Contact &amp; Demo Section","39"),
        ("s","Appendix — Feature Quick Reference","40"),
    ]
    rows_html = ""
    for kind, title, pg in rows:
        cls = "m" if kind == "m" else "s"
        t_cls = "tm" if kind == "m" else "ts"
        rows_html += f'<div class="tr {cls}"><span class="{t_cls}">{title}</span><span class="td"></span><span class="tp">{pg}</span></div>\n'

    return f"""
<div class="toc-page">
  <h1 style="margin-bottom:0;">Table of Contents</h1>
  <div class="toc-box">
    <div class="toc-head">Document Outline</div>
    {rows_html}
  </div>
  <div class="stats-g">
    <div class="stat"><div class="sv">25+</div><div class="sl">Core Modules</div></div>
    <div class="stat"><div class="sv">60+</div><div class="sl">Permissions</div></div>
    <div class="stat"><div class="sv">18+</div><div class="sl">Report Types</div></div>
    <div class="stat"><div class="sv">200+</div><div class="sl">API Endpoints</div></div>
  </div>
</div>
"""


# ─────────────────────────────────────────────────────────────────────────────
def build_content(md_content: str) -> str:
    """
    Convert markdown to HTML content.
    Strategy: FLAT layout — no nested content-page divs.
    Each SECTION heading becomes a .sec-break div with page-break-before.
    All content flows naturally inside a single .content wrapper.
    """

    # ── PRE-CLEAN the raw markdown ────────────────────────────────────────────
    lines = md_content.split('\n')
    cleaned = []
    in_code_fence = False
    skip_cover_fence = False

    for i, line in enumerate(lines):
        # Track fenced code blocks
        if line.strip().startswith('```'):
            if not in_code_fence:
                # Check if this fence contains the ASCII cover art (has ╔ or NIYAN HIREFLOW CRM)
                # Look ahead up to 5 lines
                fence_content = '\n'.join(lines[i:i+30])
                if '╔' in fence_content or 'NIYAN HIREFLOW CRM' in fence_content:
                    skip_cover_fence = True
                in_code_fence = True
                if skip_cover_fence:
                    continue
            else:
                in_code_fence = False
                if skip_cover_fence:
                    skip_cover_fence = False
                    continue
            if not skip_cover_fence:
                cleaned.append(line)
            continue

        if in_code_fence:
            if not skip_cover_fence:
                cleaned.append(line)
            continue

        # Skip purely decorative heading lines (━ repeated)
        stripped = line.strip()
        if re.match(r'^#{1,3}\s*[━─=─\s]{5,}\s*$', stripped):
            continue

        # Skip the &nbsp; lines (vertical spacers in MD)
        if stripped == '&nbsp;':
            continue

        cleaned.append(line)

    clean_md = '\n'.join(cleaned)

    # ── CONVERT MARKDOWN → HTML ───────────────────────────────────────────────
    md_proc = markdown.Markdown(extensions=['tables', 'fenced_code', 'nl2br'])
    body = md_proc.convert(clean_md)

    # ── FIX nl2br — remove <br /> inside headings (nl2br adds them) ──────────
    body = re.sub(r'(<h[1-6][^>]*>.*?)<br\s*/?>(.*?)(</h[1-6]>)',
                  lambda m: m.group(1) + ' ' + m.group(2) + m.group(3),
                  body, flags=re.DOTALL)

    # ── SECTION HEADINGS → .sec-break divs ───────────────────────────────────
    # Matches:  <h1>SECTION 1 — COVER PAGE</h1>
    # Also matches em-dash variants
    sec_re = re.compile(
        r'<h1[^>]*>\s*SECTION\s+(\d+)\s*[—–\-—–]+\s*(.+?)\s*</h1>',
        re.IGNORECASE | re.DOTALL
    )

    def sec_block(m):
        num   = m.group(1).strip()
        title = re.sub(r'<[^>]+>', '', m.group(2)).strip()  # strip any inner tags
        return (
            f'<div class="sec-break">'
            f'<div class="sn">{num}</div>'
            f'<div><div class="sl2">Section {num}</div>'
            f'<div class="st">{title}</div></div>'
            f'</div>'
        )

    body = sec_re.sub(sec_block, body)

    # ── Remove leftover decorative h1 tags (━ etc.) ───────────────────────────
    body = re.sub(r'<h1[^>]*>\s*[━─=\s&nbsp;]{3,}\s*</h1>', '', body)

    # ── Remove cover h1 (first h1 that contains "NIYAN HIREFLOW CRM") ─────────
    body = re.sub(r'<h1[^>]*>.*?NIYAN\s+HIREFLOW\s+CRM.*?</h1>', '', body, flags=re.IGNORECASE|re.DOTALL)

    # ── APPENDIX — add page break ─────────────────────────────────────────────
    body = re.sub(
        r'(<h2[^>]*>APPENDIX)',
        r'<div class="pb"></div>\1',
        body, flags=re.IGNORECASE
    )

    return body


# ─────────────────────────────────────────────────────────────────────────────
def build_html(md_content: str) -> str:
    content = build_content(md_content)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Niyan HireFlow CRM — Product Brochure</title>
  <style>{CSS}</style>
</head>
<body>

{make_cover()}

{make_toc()}

<div class="content">
{content}
</div>

<div class="footer">
  <span class="fb">Niyan HireFlow CRM</span>
  <span>Recruit Smarter. Hire Faster. Grow Together.</span>
  <span>&copy; 2025 Niyan HireFlow &nbsp;|&nbsp; Confidential</span>
</div>

</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
def find_browser():
    for p in EDGE_PATHS:
        if os.path.isfile(p):
            return p
    return None


def run_edge_pdf(browser: str, html_path: str, pdf_path: str) -> bool:
    file_url = "file:///" + html_path.replace("\\", "/")
    for flags in [
        ["--headless=new", "--disable-gpu", "--no-sandbox",
         "--run-all-compositor-stages-before-draw",
         "--virtual-time-budget=15000",
         "--disable-extensions",
         f"--print-to-pdf={pdf_path}",
         "--print-to-pdf-no-header"],
        ["--headless", "--disable-gpu", "--no-sandbox",
         f"--print-to-pdf={pdf_path}",
         "--print-to-pdf-no-header"],
    ]:
        cmd = [browser] + flags + [file_url]
        try:
            subprocess.run(cmd, capture_output=True, timeout=180)
        except Exception:
            pass
        if os.path.isfile(pdf_path) and os.path.getsize(pdf_path) > 50_000:
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
def main():
    base      = os.path.dirname(os.path.abspath(__file__))
    md_path   = os.path.join(base, MD_FILE)
    html_path = os.path.join(base, HTML_FILE)
    pdf_path  = os.path.join(base, PDF_FILE)

    print(f"  Reading   : {MD_FILE}")
    with open(md_path, encoding="utf-8") as f:
        md_content = f.read()

    print("  Building  : Premium styled HTML...")
    html = build_html(md_content)

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML saved: {HTML_FILE}  ({len(html)//1024} KB)")

    # Quick sanity check — count sections in HTML
    sec_count = html.count('class="sec-break"')
    print(f"  Sections  : {sec_count} section breaks detected in HTML")

    browser = find_browser()
    if not browser:
        print("\n  Edge/Chrome not found.")
        print(f"  Open this file in your browser and press Ctrl+P → Save as PDF:")
        print(f"  {html_path}")
        return

    print(f"  Browser   : {os.path.basename(browser)}")
    print("  Rendering : PDF generation started (may take 30–60 seconds)...")

    ok = run_edge_pdf(browser, html_path, pdf_path)
    if ok:
        kb = os.path.getsize(pdf_path) // 1024
        print(f"\n  ✓ PDF ready : {PDF_FILE}")
        print(f"    Size      : {kb} KB")
        print(f"    Location  : {pdf_path}")
    else:
        print("\n  PDF auto-generation failed.")
        print(f"  Open the HTML file manually and use Ctrl+P → Save as PDF:")
        print(f"  {html_path}")


if __name__ == "__main__":
    main()
