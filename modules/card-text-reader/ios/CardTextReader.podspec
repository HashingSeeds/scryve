Pod::Spec.new do |s|
  s.name           = 'CardTextReader'
  s.version        = '0.1.0'
  s.summary        = 'Reads card text lines and where they sit in a photo'
  s.description    = 'Reads card text lines and where they sit in a photo'
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
