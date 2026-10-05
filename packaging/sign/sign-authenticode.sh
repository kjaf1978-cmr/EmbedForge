#!/usr/bin/env bash
# Windows Authenticode signing (section 21, R-20). Runs ONLY on your Windows signing host
# with the code-signing certificate's hardware token attached (TEST-04), from Git Bash.
# Sign the binaries BEFORE the component manifests are written: the manifests record the
# hashes of the signed files.
#
#   sign-authenticode.sh <file.exe>...
#
# EF_SIGNTOOL (default: signtool.exe on PATH), EF_CERT_SHA1 (thumbprint of the certificate
# on the token) and EF_TIMESTAMP_URL (RFC 3161 time-stamp server of your CA) must be set.
set -euo pipefail
: "${EF_CERT_SHA1:?set EF_CERT_SHA1 to the certificate thumbprint}"
: "${EF_TIMESTAMP_URL:?set EF_TIMESTAMP_URL to your CA's RFC 3161 time-stamp URL}"
tool=${EF_SIGNTOOL:-signtool.exe}
for f in "$@"; do
    "$tool" sign /sha1 "$EF_CERT_SHA1" /fd SHA256 /tr "$EF_TIMESTAMP_URL" /td SHA256 /d "EmbedForge" "$f"
    "$tool" verify /pa "$f"
done
