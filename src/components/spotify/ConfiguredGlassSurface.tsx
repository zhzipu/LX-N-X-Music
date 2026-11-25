import GlassSurface, { type GlassSurfaceProps } from './GlassSurface'
import { type GlassTarget } from './glassControlSettings'
import { glassSurfaceParams } from './glassSurfaceParams'
import { useGlassControl } from './useGlassControl'

export default function ConfiguredGlassSurface({ target, capsuleRadius, ...props }: GlassSurfaceProps & { target: GlassTarget, capsuleRadius: number }) {
  const params = useGlassControl(target)
  return <GlassSurface {...props} {...glassSurfaceParams(params, capsuleRadius)} />
}
