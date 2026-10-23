import AVFoundation
import CoreMedia
import ExpoModulesCore
import Foundation

private enum FrameCastConversionError: LocalizedError {
  case invalidSource
  case invalidOutput
  case missingVideo
  case insufficientStorage
  case unsupportedExport
  case exportFailed(String)
  case wrongOutputCodec
  case cancelled

  var errorDescription: String? {
    switch self {
    case .invalidSource:
      return "The selected video is no longer available on this iPhone. Select it again and try."
    case .invalidOutput:
      return "FrameCast could not create a temporary video copy on this iPhone."
    case .missingVideo:
      return "No video track was found in this file."
    case .insufficientStorage:
      return "Not enough free iPhone storage. Free up space for a temporary TV-ready copy, then try again."
    case .unsupportedExport:
      return "This iPhone cannot convert this video to the TV-compatible format. The original is unchanged."
    case .exportFailed(let detail):
      return "The iPhone could not prepare this video: \(detail). The original is unchanged."
    case .wrongOutputCodec:
      return "The iPhone did not create an H.264 TV-ready copy. The original is unchanged."
    case .cancelled:
      return "Conversion cancelled. Your original video is unchanged."
    }
  }
}

public final class FrameCastVideoTranscoderModule: Module {
  private let stateLock = NSLock()
  private var activeSession: AVAssetExportSession?
  private var progressTimer: DispatchSourceTimer?

  public func definition() -> ModuleDefinition {
    Name("FrameCastVideoTranscoder")
    Events("framecast-video-transcode-progress")

    AsyncFunction("transcode") { (inputUri: String, outputUri: String, promise: Promise) in
      self.startTranscode(inputUri: inputUri, outputUri: outputUri, promise: promise)
    }

    Function("cancel") {
      self.cancelActiveExport()
    }
  }

  public override func willDestroy() {
    cancelActiveExport()
  }

  private func startTranscode(inputUri: String, outputUri: String, promise: Promise) {
    guard let inputURL = URL(string: inputUri), inputURL.isFileURL,
          FileManager.default.fileExists(atPath: inputURL.path),
          let inputAttributes = try? FileManager.default.attributesOfItem(atPath: inputURL.path),
          let inputSize = (inputAttributes[.size] as? NSNumber)?.int64Value,
          inputSize > 0 else {
      promise.reject("CONVERSION_SOURCE_UNAVAILABLE", FrameCastConversionError.invalidSource.localizedDescription)
      return
    }
    guard let outputURL = URL(string: outputUri), outputURL.isFileURL else {
      promise.reject("CONVERSION_OUTPUT_UNAVAILABLE", FrameCastConversionError.invalidOutput.localizedDescription)
      return
    }

    do {
      try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? FileManager.default.removeItem(at: outputURL)
      try ensureFreeSpace(for: outputURL, inputSize: inputSize)
    } catch {
      promise.reject("CONVERSION_STORAGE_UNAVAILABLE", error.localizedDescription)
      return
    }

    let asset = AVURLAsset(url: inputURL)
    guard !asset.tracks(withMediaType: .video).isEmpty else {
      promise.reject("CONVERSION_NO_VIDEO", FrameCastConversionError.missingVideo.localizedDescription)
      return
    }

    let availablePresets = AVAssetExportSession.exportPresets(compatibleWith: asset)
    let presetCandidates = [
      AVAssetExportPreset1920x1080,
      AVAssetExportPreset1280x720,
      AVAssetExportPresetMediumQuality,
    ]
    var exportSession: AVAssetExportSession?
    for preset in presetCandidates where availablePresets.contains(preset) {
      guard let candidate = AVAssetExportSession(asset: asset, presetName: preset) else { continue }
      guard candidate.supportedFileTypes.contains(.mp4) else { continue }
      exportSession = candidate
      break
    }
    guard let session = exportSession else {
      promise.reject("CONVERSION_UNSUPPORTED", FrameCastConversionError.unsupportedExport.localizedDescription)
      return
    }

    stateLock.lock()
    guard activeSession == nil else {
      stateLock.unlock()
      promise.reject("CONVERSION_BUSY", "A video is already being prepared for this TV.")
      return
    }
    activeSession = session
    stateLock.unlock()

    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    startProgressTimer(for: session)
    session.exportAsynchronously { [weak self] in
      guard let self else {
        try? FileManager.default.removeItem(at: outputURL)
        promise.reject("CONVERSION_FAILED", "FrameCast could not finish the video conversion.")
        return
      }
      self.stopProgressTimer(for: session)

      switch session.status {
      case .completed:
        do {
          try Self.verifyH264Video(at: outputURL)
          let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
          let outputSize = (attributes[.size] as? NSNumber)?.doubleValue ?? 0
          guard outputSize > 0 else { throw FrameCastConversionError.invalidOutput }
          self.sendProgress(percent: 100, phase: "complete")
          promise.resolve(["uri": outputURL.absoluteString, "size": outputSize])
        } catch {
          try? FileManager.default.removeItem(at: outputURL)
          promise.reject("CONVERSION_FAILED", error.localizedDescription)
        }
      case .cancelled:
        try? FileManager.default.removeItem(at: outputURL)
        promise.reject("CONVERSION_CANCELLED", FrameCastConversionError.cancelled.localizedDescription)
      default:
        try? FileManager.default.removeItem(at: outputURL)
        let detail = session.error?.localizedDescription ?? FrameCastConversionError.unsupportedExport.localizedDescription
        promise.reject("CONVERSION_FAILED", FrameCastConversionError.exportFailed(detail).localizedDescription)
      }
      self.clearActiveSession(session)
    }
  }

  private func ensureFreeSpace(for outputURL: URL, inputSize: Int64) throws {
    let attributes = try FileManager.default.attributesOfFileSystem(
      forPath: outputURL.deletingLastPathComponent().path
    )
    guard let freeBytes = (attributes[.systemFreeSize] as? NSNumber)?.int64Value else {
      throw FrameCastConversionError.insufficientStorage
    }
    let estimatedRequired = inputSize.multipliedReportingOverflow(by: 2)
    guard !estimatedRequired.overflow,
          freeBytes >= estimatedRequired.partialValue + 128 * 1024 * 1024 else {
      throw FrameCastConversionError.insufficientStorage
    }
  }

  private static func verifyH264Video(at outputURL: URL) throws {
    let asset = AVURLAsset(url: outputURL)
    guard let track = asset.tracks(withMediaType: .video).first,
          let description = track.formatDescriptions.first as? CMFormatDescription,
          CMFormatDescriptionGetMediaSubType(description) == kCMVideoCodecType_H264 else {
      throw FrameCastConversionError.wrongOutputCodec
    }
  }

  private func startProgressTimer(for session: AVAssetExportSession) {
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
    timer.schedule(deadline: .now(), repeating: .milliseconds(500))
    timer.setEventHandler { [weak self, weak session] in
      guard let self, let session else { return }
      let percent = min(99, max(0, Int(session.progress * 100)))
      self.sendProgress(percent: percent, phase: "encoding")
    }

    stateLock.lock()
    progressTimer = timer
    stateLock.unlock()
    timer.resume()
  }

  private func stopProgressTimer(for session: AVAssetExportSession) {
    stateLock.lock()
    let timer = activeSession === session ? progressTimer : nil
    if activeSession === session {
      progressTimer = nil
    }
    stateLock.unlock()
    timer?.cancel()
  }

  private func clearActiveSession(_ session: AVAssetExportSession) {
    stateLock.lock()
    if activeSession === session {
      activeSession = nil
    }
    stateLock.unlock()
  }

  private func cancelActiveExport() {
    stateLock.lock()
    let session = activeSession
    stateLock.unlock()
    session?.cancelExport()
  }

  private func sendProgress(percent: Int, phase: String) {
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent("framecast-video-transcode-progress", [
        "percent": min(100, max(0, percent)),
        "phase": phase,
      ])
    }
  }
}
