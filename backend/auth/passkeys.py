"""WebAuthn ceremony wrappers + AAGUID → friendly-name lookup.

Uses py_webauthn (the `webauthn` package). We deliberately keep the router's
view of this thin: it deals in dicts and bytes; the library specifics live here.
"""

from typing import List, Optional

from webauthn import (
    generate_registration_options,
    generate_authentication_options,
    verify_registration_response,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from . import config


# AAGUIDs of common authenticators → human label. The user can rename freely.
# Source: passkeydeveloper/passkey-authenticator-aaguids on GitHub.
AAGUID_LABELS: dict[bytes, str] = {
    bytes.fromhex("b84e4048157048a1934f93dfff8d51f7"): "1Password",
    bytes.fromhex("bada55554552415465794d61679ed9ff"): "1Password",  # legacy 1P
    bytes.fromhex("fbfc30700beb494b8e8fadeb1e8d4afd"): "iCloud Keychain",
    bytes.fromhex("dd4ec289e01d41c9bb8970fa845d4bf2"): "iCloud Keychain (Mac)",
    bytes.fromhex("08987058cadc4b81b6e130de50dcbe96"): "Windows Hello",
    bytes.fromhex("6028b017b1d44c02b4b3afcdafc96bb2"): "Windows Hello",
    bytes.fromhex("b93fd961f2e6462fb12282002247de78"): "Android Credential Manager",
    bytes.fromhex("ea9b8d664d011d213ce4b6b48cb575d4"): "Google Password Manager",
}


def friendly_name_for(aaguid: Optional[bytes]) -> str:
    if not aaguid:
        return "Security key"
    return AAGUID_LABELS.get(aaguid, "Passkey")


def begin_registration(
    *,
    user_id: bytes,
    user_name: str,
    user_display_name: str,
    exclude_credential_ids: List[bytes],
) -> tuple[bytes, str]:
    """Returns (challenge_bytes, options_json_str).

    options_json_str is ready for the browser; pass it straight through.
    `exclude_credential_ids` prevents double-enrolling the same authenticator.
    """
    options = generate_registration_options(
        rp_id=config.RP_ID,
        rp_name=config.RP_NAME,
        user_id=user_id,
        user_name=user_name,
        user_display_name=user_display_name,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cid) for cid in exclude_credential_ids
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            # Require discoverable credential so usernameless login works.
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    return options.challenge, options_to_json(options)


def finish_registration(*, credential: dict, expected_challenge: bytes) -> dict:
    """Verifies the registration response. Returns a dict with the persistable fields."""
    verification = verify_registration_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_origin=config.EXPECTED_ORIGINS,
        expected_rp_id=config.RP_ID,
    )
    return {
        "credential_id": verification.credential_id,
        "public_key": verification.credential_public_key,
        "sign_count": verification.sign_count,
        "aaguid": _aaguid_to_bytes(verification.aaguid),
    }


def begin_authentication() -> tuple[bytes, str]:
    """Usernameless / discoverable credential flow. Empty allowCredentials."""
    options = generate_authentication_options(
        rp_id=config.RP_ID,
        allow_credentials=[],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    return options.challenge, options_to_json(options)


def finish_authentication(
    *,
    credential: dict,
    expected_challenge: bytes,
    stored_public_key: bytes,
    stored_sign_count: int,
) -> int:
    """Verifies the assertion. Returns the new sign_count to persist."""
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_origin=config.EXPECTED_ORIGINS,
        expected_rp_id=config.RP_ID,
        credential_public_key=stored_public_key,
        credential_current_sign_count=stored_sign_count,
    )
    return verification.new_sign_count


def _aaguid_to_bytes(aaguid) -> Optional[bytes]:
    """py_webauthn returns AAGUID as a UUID string ('xxxxxxxx-xxxx-...'); normalize to bytes."""
    if aaguid is None:
        return None
    if isinstance(aaguid, bytes):
        return aaguid
    if isinstance(aaguid, str):
        try:
            return bytes.fromhex(aaguid.replace("-", ""))
        except ValueError:
            return None
    return None
