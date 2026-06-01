"""
Document Center Models - Company Level
Full HR Document Management System: templates, versions, generated docs, categories, approvals.
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class DocTemplateType(str, Enum):
    SIMPLE   = "simple"    # Template Builder (rich-text)
    ADVANCED = "advanced"  # Advanced Designer (canvas)
    IMPORTED = "imported"  # Uploaded file (DOCX/PDF/HTML)


class DocStatus(str, Enum):
    DRAFT    = "draft"
    REVIEW   = "review"
    APPROVED = "approved"
    GENERATED = "generated"
    SENT     = "sent"
    SIGNED   = "signed"
    ARCHIVED = "archived"


class PaperSize(str, Enum):
    A4     = "A4"
    LETTER = "letter"
    LEGAL  = "legal"


class PaperOrientation(str, Enum):
    PORTRAIT  = "portrait"
    LANDSCAPE = "landscape"


class WatermarkType(str, Enum):
    TEXT  = "text"
    IMAGE = "image"
    LOGO  = "logo"


class ApprovalStatus(str, Enum):
    PENDING  = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# ─── Sub-models (embedded in TemplateContent) ─────────────────────────────────

class HeaderContent(BaseModel):
    model_config = ConfigDict(extra="allow")
    show:              bool  = True
    logo_url:          Optional[str] = None
    logo_height:       int   = 40
    logo_alignment:    str   = "left"      # left | center | right (independent)
    company_name:      str   = ""
    company_address:   str   = ""
    company_email:     str   = ""
    company_phone:     str   = ""
    company_website:   str   = ""
    gst_number:        str   = ""
    reg_number:        str   = ""
    company_alignment: str   = "left"      # separate from logo alignment
    header_height:     int   = 120         # px
    padding_top:       int   = 12
    padding_right:     int   = 16
    padding_bottom:    int   = 8
    padding_left:      int   = 16
    margin_top:        int   = 0
    margin_right:      int   = 0
    margin_bottom:     int   = 0
    margin_left:       int   = 0
    font_family:       str   = "Arial"
    font_size:         int   = 12
    font_weight:       str   = "normal"
    font_style:        str   = "normal"
    font_color:        str   = "#000000"
    background_color:  str   = "#ffffff"
    border_bottom:     bool  = True
    border_color:      str   = "#d1d5db"
    border_width:      int   = 1


class FooterContent(BaseModel):
    model_config = ConfigDict(extra="allow")
    show:               bool = True
    text:               str  = ""
    description:        str  = ""
    website:            str  = ""
    email:              str  = ""
    phone:              str  = ""
    footer_height:      int  = 60
    padding_top:        int  = 8
    padding_right:      int  = 16
    padding_bottom:     int  = 12
    padding_left:       int  = 16
    margin_top:         int  = 0
    margin_right:       int  = 0
    margin_bottom:      int  = 0
    margin_left:        int  = 0
    show_page_numbers:  bool = True
    show_date:          bool = True
    confidential_label: bool = False
    alignment:          str  = "center"
    font_size:          int  = 10
    font_color:         str  = "#666666"
    border_top:         bool = True
    border_color:       str  = "#d1d5db"
    border_width:       int  = 1


class WatermarkContent(BaseModel):
    enabled:   bool          = False
    type:      WatermarkType = WatermarkType.TEXT
    text:      str           = "CONFIDENTIAL"
    image_url: Optional[str] = None
    position:  str           = "center"  # center | diagonal | top-left | bottom-right
    opacity:   float         = 0.15
    rotation:  float         = -45.0
    size:      int           = 72


class PaperSettings(BaseModel):
    size:          PaperSize        = PaperSize.A4
    orientation:   PaperOrientation = PaperOrientation.PORTRAIT
    margin_top:    int = 72   # points  (72pt = 1 inch)
    margin_bottom: int = 72
    margin_left:   int = 72
    margin_right:  int = 72
    auto_pagination: bool = True


class CanvasElement(BaseModel):
    """Single element on the Advanced Designer canvas."""
    id:         str   = Field(default_factory=lambda: str(uuid.uuid4()))
    type:       str   = "text"   # text | image | table | shape | line | signature | stamp | qr | barcode
    x:          float = 0
    y:          float = 0
    width:      float = 200
    height:     float = 100
    rotation:   float = 0
    z_index:    int   = 1
    locked:     bool  = False
    visible:    bool  = True
    properties: Dict[str, Any] = {}


class TemplateContent(BaseModel):
    """Full document layout — header + body + footer + paper + watermark + canvas."""
    header:          HeaderContent   = Field(default_factory=HeaderContent)
    body_html:       str             = ""   # Rich-text HTML for simple builder
    footer:          FooterContent   = Field(default_factory=FooterContent)
    paper:           PaperSettings   = Field(default_factory=PaperSettings)
    watermark:       WatermarkContent = Field(default_factory=WatermarkContent)
    canvas_elements: List[CanvasElement] = []   # Advanced designer
    custom_css:      str             = ""


# ─── Core Documents ───────────────────────────────────────────────────────────

class DocCategory(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id:          str      = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    name:        str
    description: str      = ""
    color:       str      = "#7c3aed"
    icon:        str      = "folder"
    sort_order:  int      = 0
    is_deleted:  bool     = False
    created_by:  str      = ""
    created_at:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocTemplate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id:                str              = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    name:              str
    description:       str              = ""
    category_id:       Optional[str]    = None
    category_name:     str              = ""
    template_type:     DocTemplateType  = DocTemplateType.SIMPLE
    status:            DocStatus        = DocStatus.DRAFT
    tags:              List[str]        = []
    content:           TemplateContent  = Field(default_factory=TemplateContent)
    dynamic_fields:    List[str]        = []
    is_favorite:       bool             = False
    is_archived:       bool             = False
    is_deleted:        bool             = False
    version:           int              = 1
    # For imported files
    s3_key:            Optional[str]    = None
    original_filename: Optional[str]    = None
    file_type:         Optional[str]    = None   # pdf | docx | html
    # Tracking
    generate_count:    int              = 0
    created_by:        str              = ""
    created_by_name:   str              = ""
    updated_by:        str              = ""
    created_at:        datetime         = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at:        datetime         = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocTemplateVersion(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id:             str            = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    template_id:    str
    version:        int
    name:           str
    content:        TemplateContent
    change_summary: str            = ""
    created_by:     str            = ""
    created_by_name: str           = ""
    created_at:     datetime       = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocGenerated(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id:              str                 = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    template_id:     str
    template_name:   str
    document_name:   str
    employee_id:     Optional[str]       = None
    employee_name:   Optional[str]       = None
    employee_email:  Optional[str]       = None
    field_values:    Dict[str, str]      = {}
    html_content:    str                 = ""
    status:          DocStatus           = DocStatus.GENERATED
    pdf_s3_key:      Optional[str]       = None
    docx_s3_key:     Optional[str]       = None
    pdf_url:         Optional[str]       = None
    docx_url:        Optional[str]       = None
    sent_at:         Optional[datetime]  = None
    signed_at:       Optional[datetime]  = None
    is_deleted:      bool                = False
    created_by:      str                 = ""
    created_by_name: str                 = ""
    created_at:      datetime            = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at:      datetime            = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocApproval(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id:                str              = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    template_id:       str
    template_name:     str
    requested_by:      str
    requested_by_name: str
    approver_id:       Optional[str]   = None
    approver_name:     Optional[str]   = None
    status:            ApprovalStatus  = ApprovalStatus.PENDING
    comments:          str             = ""
    reviewer_comments: str             = ""
    reviewed_at:       Optional[datetime] = None
    created_at:        datetime        = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at:        datetime        = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Request Models ────────────────────────────────────────────────────────────

class DocCategoryCreate(BaseModel):
    name:        str
    description: str = ""
    color:       str = "#7c3aed"
    icon:        str = "folder"
    sort_order:  int = 0


class DocCategoryUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    color:       Optional[str] = None
    icon:        Optional[str] = None
    sort_order:  Optional[int] = None


class DocTemplateCreate(BaseModel):
    name:          str
    description:   str            = ""
    category_id:   Optional[str]  = None
    template_type: DocTemplateType = DocTemplateType.SIMPLE
    tags:          List[str]      = []
    content:       Optional[TemplateContent] = None
    dynamic_fields: List[str]    = []
    change_summary: str          = "Initial version"


class DocTemplateUpdate(BaseModel):
    name:           Optional[str]            = None
    description:    Optional[str]            = None
    category_id:    Optional[str]            = None
    status:         Optional[DocStatus]      = None
    tags:           Optional[List[str]]      = None
    content:        Optional[TemplateContent] = None
    dynamic_fields: Optional[List[str]]      = None
    is_favorite:    Optional[bool]           = None
    is_archived:    Optional[bool]           = None
    change_summary: str                      = ""


class DocGenerateRequest(BaseModel):
    template_id:   str
    document_name: str
    employee_id:   Optional[str]       = None
    field_values:  Dict[str, str]      = {}
    generate_pdf:  bool                = True
    generate_docx: bool                = False
    send_email:    bool                = False
    recipient_email: Optional[str]     = None


class DocSendRequest(BaseModel):
    recipient_email: str
    recipient_name:  str
    subject:         str = ""
    message:         str = ""


class DocApprovalCreate(BaseModel):
    template_id: str
    comments:    str = ""


class DocApprovalReview(BaseModel):
    status:           ApprovalStatus   # approved | rejected
    reviewer_comments: str = ""


# ─── Response Models ───────────────────────────────────────────────────────────

class DocCategoryResponse(DocCategory):
    template_count: int = 0


class DocTemplateResponse(DocTemplate):
    category_color: Optional[str] = None


class DocTemplateListItem(BaseModel):
    """Lightweight list item — no heavy content blob."""
    id:              str
    name:            str
    description:     str
    category_id:     Optional[str]
    category_name:   str
    category_color:  Optional[str]
    template_type:   DocTemplateType
    status:          DocStatus
    tags:            List[str]
    is_favorite:     bool
    is_archived:     bool
    version:         int
    generate_count:  int
    dynamic_fields:  List[str]
    original_filename: Optional[str]
    file_type:       Optional[str]
    created_by_name: str
    created_at:      datetime
    updated_at:      datetime


class DocGeneratedListItem(BaseModel):
    id:              str
    template_id:     str
    template_name:   str
    document_name:   str
    employee_id:     Optional[str]
    employee_name:   Optional[str]
    employee_email:  Optional[str]
    status:          DocStatus
    pdf_url:         Optional[str]
    docx_url:        Optional[str]
    sent_at:         Optional[datetime]
    created_by_name: str
    created_at:      datetime
