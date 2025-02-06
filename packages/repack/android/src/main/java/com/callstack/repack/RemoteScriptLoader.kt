package com.callstack.repack

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.util.concurrent.TimeUnit

class RemoteScriptLoader(val reactContext: ReactContext, private val nativeLoader: NativeScriptLoader) {
    private val scriptsDirName = "scripts"
    private val client = OkHttpClient()

    private fun getScriptFilePath(scriptUniqueId: String): String {
        return "${scriptsDirName}/$scriptUniqueId.script.bundle"
    }

    private fun createClientPerRequest(config: ScriptConfig): OkHttpClient {
        val clientPerRequestBuilder = client.newBuilder()
        clientPerRequestBuilder.connectTimeout(config.timeout.toLong(), TimeUnit.MILLISECONDS)
        clientPerRequestBuilder.readTimeout(config.timeout.toLong(), TimeUnit.MILLISECONDS)

        return clientPerRequestBuilder.build()
    }

    private fun downloadAndCache(config: ScriptConfig, onSuccess: (bundle: ByteArray) -> Unit, onError: (code: String, message: String) -> Unit) {
        val path = getScriptFilePath(config.uniqueId)
        val file = File(reactContext.filesDir, path)

        val callback = object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError(
                        ScriptLoadingError.NetworkFailure.code,
                        e.message ?: e.toString()
                )
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    try {
                        val scriptsDir = File(reactContext.filesDir, scriptsDirName)
                        if (!scriptsDir.exists()) {
                            scriptsDir.mkdir()
                        }

                        val rawBundle = response.body?.bytes()

                        val (bundle, token) = rawBundle?.let {
                            CodeSigningUtils.extractBundleAndToken(rawBundle)
                        } ?: Pair(null, null)

                        if (config.verifyScriptSignature == "strict" || (config.verifyScriptSignature == "lax" && token != null)) {
                            CodeSigningUtils.verifyBundle(reactContext, token, bundle)
                        }

                        if (bundle == null) {
                            throw Exception("Request should have returned with a valid bundle")
                        } else if (bundle.isEmpty()) {
                            throw Exception("Request returned an empty bundle")
                        }
                        

                        file.createNewFile()

                        val outputStream = file.outputStream()
                        val writer = BufferedOutputStream(outputStream)
                        writer.write(bundle)
                        writer.close()
                        onSuccess(bundle)
                    } catch (error: Exception) {
                        onError(
                                ScriptLoadingError.ScriptCachingFailure.code,
                                error.message ?: error.toString()
                        )
                    }
                } else {
                    onError(
                            ScriptLoadingError.RequestFailure.code,
                            "Request should have returned with 200 HTTP status, but instead it received ${response.code}"
                    )
                }
            }
        }

        val clientPerRequest = createClientPerRequest(config)
        var request = Request.Builder()
                .url(config.url)
                .headers(config.headers)


        if (config.method == "POST" && config.body != null) {
            request = request.post(config.body)
        }

        clientPerRequest.newCall(request.build()).enqueue(callback)
    }

    fun execute(config: ScriptConfig, promise: Promise) {
        val scriptPath = getScriptFilePath(config.uniqueId)
        try {
            val file = File(reactContext.filesDir, scriptPath)
            if (!file.exists()) {
                throw Exception("Script file does not exist: $file")
            }
            
            val code = FileInputStream(file).use { it.readBytes() }
            if (code.isEmpty()) {
                throw Exception("Script file exists but could not be read: $file")
            }

            nativeLoader.evaluate(code, config.sourceUrl, promise)
        } catch (error: Exception) {
            promise.reject(
                    ScriptLoadingError.ScriptEvalFailure.code,
                    error.message ?: error.toString()
            )
        }
    }


    fun prefetch(config: ScriptConfig, promise: Promise) {
        downloadAndCache(config, { promise.resolve(null) }, { code, message -> promise.reject(code, message) })
    }

    fun load(config: ScriptConfig, promise: Promise) {
        downloadAndCache(config, { bundle: ByteArray ->
            try {
                nativeLoader.evaluate(bundle, config.sourceUrl, promise)
            } catch (error: Exception) {
                promise.reject(
                        ScriptLoadingError.ScriptEvalFailure.code,
                        error.message ?: error.toString()
                )
            }
        }, { code, message -> promise.reject(code, message) })
    }

    fun invalidate(scriptId: String?) {
        if (scriptId != null) {
            val file = File(reactContext.filesDir, getScriptFilePath(scriptId))

            if (file.exists()) {
                file.delete()
            }
        }
    }

    fun invalidateAll() {
        val file = File(reactContext.filesDir, scriptsDirName)
        if (file.exists()) {
            file.deleteRecursively()
        }
    }
}
