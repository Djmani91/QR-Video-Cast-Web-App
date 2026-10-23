Pod::Spec.new do |s|
  s.name = 'FrameCastVideoTranscoder'
  s.version = '1.0.0'
  s.summary = 'On-device video conversion for FrameCast'
  s.description = 'Converts selected local videos to a TV-compatible H.264 MP4 on the device.'
  s.license = { :type => 'MIT' }
  s.author = 'FrameCast'
  s.homepage = 'https://github.com/Djmani91/Framecast'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end
