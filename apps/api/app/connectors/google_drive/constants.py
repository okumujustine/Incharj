GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_EXPORT_URL = "https://www.googleapis.com/drive/v3/files/{file_id}/export"
GOOGLE_DRIVE_DOWNLOAD_URL = "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"

ABSOLUTE_CONNECTOR_DOC_CAP = 5

GOOGLE_DRIVE_FILE_TYPES = [
    {"id": "google_docs", "label": "Google Docs", "mime_type": "application/vnd.google-apps.document", "ext": "gdoc"},
    {"id": "google_sheets", "label": "Google Sheets", "mime_type": "application/vnd.google-apps.spreadsheet", "ext": "gsheet"},
    {"id": "google_slides", "label": "Google Slides", "mime_type": "application/vnd.google-apps.presentation", "ext": "gslides"},
    {"id": "pdf", "label": "PDF", "mime_type": "application/pdf", "ext": "pdf"},
    {"id": "docx", "label": "Word Document", "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ext": "docx"},
    {"id": "xlsx", "label": "Excel Spreadsheet", "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ext": "xlsx"},
    {"id": "plain_text", "label": "Plain Text", "mime_type": "text/plain", "ext": "txt"},
    {"id": "markdown", "label": "Markdown", "mime_type": "text/markdown", "ext": "md"},
    {"id": "html", "label": "HTML", "mime_type": "text/html", "ext": "html"},
    {"id": "csv", "label": "CSV", "mime_type": "text/csv", "ext": "csv"},
]

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

EXPORT_MIME_TYPES: dict[str, str] = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}
