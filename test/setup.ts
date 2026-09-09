import { parse, stringify } from 'yaml'
import { setYamlCodec } from '@system-commons/core'
import { setPlatform } from '@system-commons/ui'
import { domPlatform } from '@system-commons/ui/dom-platform'
import '@system-commons/ui/dom-shim'

setYamlCodec({ parse, stringify })
if (typeof document !== 'undefined') setPlatform(domPlatform)
