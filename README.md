# Project Mapper & AI Persistent Memory Engine

Framework dan MCP Server mandiri untuk:
1. **Persistent Project Memory & Cold-Start Recovery** (Mencegah AI lupa ingatan saat lama tidak membuka proyek).
2. **Delta Sync (0 Token Parsing)**: Mendeteksi perubahan file via checksum & mtime secara lokal tanpa meminta LLM membaca ulang file.
3. **Executive Cold-Start Digest**: Memberikan rangkuman arsitektur lengkap kepada AI di bawah 300 token saat IDE pertama dibuka.
4. **AST Codebase & Data Flow Mapping**: Memetakan struktur modul, dependensi, dan alur data.

## CLI Usage

```bash
# Inisialisasi memory untuk proyek saat ini
npx project-mapper init

# Dapatkan cold-start digest instan untuk AI
npx project-mapper digest

# Cek delta perubahan file sejak sesi terakhir
npx project-mapper status

# Simpan checkpoint sebelum menutup IDE
npx project-mapper checkpoint "Selesai implementasi auth" "Lanjutkan ke unit test"

# Sinkronisasi kondisi berkas saat ini sebagai baseline baru
npx project-mapper sync

# Pindai AST codebase (0 token LLM, ekstrak class, method, endpoints, call graph)
npx project-mapper map

# Telusuri alur pemrosesan data & buat diagram sequence Mermaid
npx project-mapper trace "GET /users"

# Tampilkan seluruh endpoint HTTP API yang terdeteksi
npx project-mapper endpoints

# Tampilkan simbol kode (class, function, interface) dalam berkas
npx project-mapper symbols src/parser/ast_parser.ts

# Jalankan server MCP untuk integrasi IDE (Antigravity/Cursor/Claude)
npx project-mapper serve
```
