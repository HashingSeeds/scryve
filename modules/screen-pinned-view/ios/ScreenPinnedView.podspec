Pod::Spec.new do |s|
  s.name           = 'ScreenPinnedView'
  s.version        = '0.1.0'
  s.summary        = 'Keeps React children pinned to the screen hardware while the window rotates'
  s.description    = 'Keeps React children pinned to the screen hardware while the window rotates'
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
