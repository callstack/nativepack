package com.callstack.repack

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactContext
import java.io.File
import java.io.FileInputStream
import java.lang.Exception

class FileSystemScriptLoader(private val reactContext: ReactContext) {
    private external fun evaluateJavascript(jsiPtr: Long, code: ByteArray, url: String)

    private fun evaluate(script: ByteArray, url: String) {
        val contextHolder = reactContext.javaScriptContextHolder!!
        val jsiPtr: Long = contextHolder.get()
        evaluateJavascript(jsiPtr, script, url)
    }

    fun load(config: ScriptConfig, promise: Promise) {
        try {
            if (config.absolute) {
                val path = config.url.path
                val file = File(path)
                val code: ByteArray = FileInputStream(file).use { it.readBytes() }
                evaluate(code, path)
            } else {
                val assetName = config.url.file.split("/").last()
                val inputStream = reactContext.assets.open(assetName)
                val code: ByteArray = inputStream.use { it.readBytes() }
                evaluate(code, assetName)
            }
            promise.resolve(null);
        } catch (error: Exception) {
            promise.reject(
                    ScriptLoadingError.FileSystemEvalFailure.code,
                    error.message ?: error.toString()
            )
        }
    }
}
