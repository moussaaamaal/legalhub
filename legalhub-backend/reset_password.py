import hashlib, base64, bcrypt

password = "ons123"
digest = hashlib.sha256(password.encode("utf-8")).digest()
pre_hash = base64.b64encode(digest)
hashed = bcrypt.hashpw(pre_hash, bcrypt.gensalt()).decode("utf-8")
print(hashed)
