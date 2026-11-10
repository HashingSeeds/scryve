Pod::Spec.new do |s|
  s.name           = 'DisplayCorners'
  s.version        = '0.1.0'
  s.summary        = 'Reports the model identifier the display corner table is keyed by'
  s.description    = 'Reports the model identifier the display corner table is keyed by'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
