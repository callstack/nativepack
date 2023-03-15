package com.callstack.repack

import android.content.Context
import android.util.Base64
import com.nimbusds.jose.JWSVerifier
import com.nimbusds.jose.crypto.RSASSAVerifier
import com.nimbusds.jwt.SignedJWT
import java.math.BigInteger
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.security.PublicKey
import java.security.interfaces.RSAPublicKey
import java.security.spec.X509EncodedKeySpec


class CodeSigningUtils {
    companion object {
        private fun getHash(string: String): ByteArray? {
            var digest: MessageDigest? = null
            try {
                digest = MessageDigest.getInstance("SHA-256")
            } catch (e1: NoSuchAlgorithmException) {
                e1.printStackTrace()
            }
            digest?.reset()
            return digest?.digest(string.toByteArray())
        }

        private fun bin2hex(data: ByteArray): String {
            return java.lang.String.format("%0" + data.size * 2 + "x", BigInteger(1, data))
        }

        private fun computeHash(content: String?): String? {
            if (content == null) {
                return null
            }

            val hashByteArray = getHash(content) ?: return null

            return bin2hex(hashByteArray)
        }

        private fun parsePublicKey(stringPublicKey: String): PublicKey? {
            val formattedPublicKey = stringPublicKey.replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replace(System.getProperty("line.separator")!!, "")

            val byteKey: ByteArray = Base64.decode(formattedPublicKey.toByteArray(), Base64.DEFAULT)
            val x509Key = X509EncodedKeySpec(byteKey)
            val kf = KeyFactory.getInstance("RSA")

            return kf.generatePublic(x509Key)
        }

        private fun verifyAndDecodeToken(
            token: String, publicKey: PublicKey?
        ): Map<String, Any?> {
            val signedJWT = runCatching { SignedJWT.parse(token) }.getOrNull()
                ?: throw Exception("The bundle verification failed because the token could not be decoded.")
            val verifier: JWSVerifier = RSASSAVerifier(publicKey as RSAPublicKey)

            val verificationSuccessful = runCatching { signedJWT.verify(verifier) }.getOrNull()
            if (verificationSuccessful != true) {
                throw Exception("The bundle verification failed because token verification was unsuccessful. This might mean the token has been tampered with.")
            }

            return signedJWT.jwtClaimsSet.claims
        }

        private fun getPublicKeyFromStringsIfExist(
            context: Context
        ): String? {
            val packageName: String = context.packageName
            val resId: Int =
                context.resources.getIdentifier("RepackPublicKey", "string", packageName)
            if (resId != 0) {
                return context.getString(resId).ifEmpty {
                    null
                }
            }
            return null
        }

        fun verifyBundle(context: Context, token: String?, fileContent: String?) {
            if (token == null) {
                throw Exception("The bundle verification failed because no token for the bundle was found.")
            }

            val stringPublicKey = getPublicKeyFromStringsIfExist(context)
                ?: throw Exception("The bundle verification failed because PublicKey was not found in the bundle. Make sure you've added the PublicKey to the res/values/strings.xml under RepackPublicKey key.")

            val publicKey = parsePublicKey(stringPublicKey)
                ?: throw Exception("The bundle verification failed because the PublicKey is invalid.")

            val claims: Map<String, Any?> = verifyAndDecodeToken(token, publicKey)

            val contentHash = claims["hash"] as String?
                ?: throw Exception("The bundle verification failed because the token is invalid.")

            val fileHash = computeHash(fileContent)

            if (contentHash != fileHash) {
                throw Exception("The bundle verification failed because the bundle hash is invalid.")
            }
        }
    }
}
