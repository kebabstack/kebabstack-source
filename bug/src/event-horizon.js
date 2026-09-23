import * as T from 'three';

// Lens-inspired sky illustration: one quad, no costly raymarching or screen copy.
export class EventHorizon {
  constructor(scene) {
    this.uniforms={clock:{value:0},fade:{value:0}};
    this.mesh=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({
      transparent:true,depthWrite:false,fog:false,uniforms:this.uniforms,
      vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 uv0;uniform float clock;uniform float fade;
      float band(float r,float at,float width){return exp(-pow((r-at)/width,2.));}
      void main(){
        vec2 p=(uv0-.5)*2.;p=mat2(.982,-.189,.189,.982)*p;
        float r=length(p),angle=atan(p.y,p.x);
        float shadow=1.-smoothstep(.252,.266,r);
        float photon=band(r,.271,.006)+band(r,.273,.025)*.22;
        float halo=exp(-max(0.,r-.275)*12.)*.14*(1.-shadow);
        float diskR=length(vec2(p.x,p.y/.235));
        float edges=smoothstep(.30,.34,diskR)*(1.-smoothstep(.76,.97,diskR));
        float striae=.6+.22*sin(diskR*150.+sin(angle*7.-clock*.32)*1.1)+.12*sin(diskR*283.-clock*.12);
        float front=1.-smoothstep(-.045,.01,p.y);
        float disk=edges*striae*mix(1.-shadow,1.,front);
        disk*=.78+.22*sin(angle*3.-clock*.22+diskR*17.);
        // Rear disk light bends above and below the circular shadow.
        float lensR=length(vec2(p.x,p.y*.82));
        float arc=band(lensR,.302,.015)+band(lensR,.331,.022)*.36;
        arc*=smoothstep(.018,.13,abs(p.y))*(1.-smoothstep(.30,.39,abs(p.x)));
        arc*=mix(.42,1.,step(0.,p.y));
        float doppler=1.+.5*clamp(-p.x,-1.,1.);
        vec3 gold=mix(vec3(1.,.28,.10),vec3(1.,.80,.43),pow(1.-clamp(diskR,0.,1.),.7));
        vec3 light=gold*disk*doppler*1.4+vec3(1.3,.75,.35)*arc+vec3(1.6,1.15,.62)*photon;
        light+=vec3(.52,.24,.48)*halo;
        float alpha=clamp(max(shadow,max(disk,arc)*.85+photon+halo),0.,1.);
        alpha*=1.-smoothstep(.92,1.,r);
        gl_FragColor=vec4(light+vec3(.001,.002,.006)*shadow,alpha*fade);
      }`
    }));
    this.mesh.name='Event horizon / distant black hole';this.mesh.renderOrder=1;
    scene.add(this.mesh);this.offset=new T.Vector3();
  }
  update(camera,distance,clock,reduced=false) {
    const fade=T.MathUtils.smoothstep(distance,1800,2250);
    this.mesh.visible=fade>0;this.uniforms.fade.value=fade;
    this.uniforms.clock.value=reduced?0:clock;
    const halfH=Math.tan(camera.fov*Math.PI/360)*1050,halfW=halfH*camera.aspect;
    const size=Math.min(halfW*.35,halfH*.49);
    this.offset.set(-halfW*.61,halfH*.03,-1050).applyQuaternion(camera.quaternion);
    this.mesh.position.copy(camera.position).add(this.offset);
    this.mesh.quaternion.copy(camera.quaternion);this.mesh.scale.setScalar(size);
  }
}
