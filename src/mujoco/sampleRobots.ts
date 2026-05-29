export const CARTWHEEL_XML = `<?xml version="1.0"?>
<mujoco model="Cartwheel">
  <compiler angle="radian" autolimits="true"/>

  <option timestep="0.02" gravity="0 -9.81 0"/>

  <default>
    <joint type="hinge" axis="0 0 1" damping="0.1"/>
    <geom type="capsule" rgba="0.8 0.6 0.4 1"/>
  </default>

  <worldbody>
    <body name="cart" pos="0 0.05 0">
      <joint name="cart" type="slide" axis="1 0 0" limited="true" range="-3 3" pos="0 0 0"/>
      <geom type="box" size="0.25 0.05 0.15" rgba="0.3 0.5 0.8 1"/>
      <body name="pendulum" pos="0 0.05 0">
        <joint name="pendulum" range="-3.14 3.14"/>
        <geom type="capsule" size="0.03" fromto="0 0 0 0 -0.4 0" rgba="0.8 0.2 0.2 1"/>
        <geom type="sphere" size="0.05" pos="0 -0.4 0" rgba="0.9 0.3 0.3 1"/>
      </body>
    </body>
  </worldbody>

  <actuator>
    <motor name="cart_motor" gear="10" joint="cart"/>
  </actuator>
</mujoco>`

export const WALKER_XML = `<?xml version="1.0"?>
<mujoco model="Walker2D">
  <compiler angle="degree" autolimits="true"/>
  <option timestep="0.008" gravity="0 -9.81 0" tolerance="1e-6"/>

  <default>
    <joint type="hinge" axis="0 0 1" damping="1" limited="true"/>
    <geom type="capsule" size="0.04" rgba="0.8 0.6 0.4 1"/>
    <motor ctrlrange="-100 100" ctrllimited="true"/>
  </default>

  <worldbody>
    <light pos="0 5 5" dir="0 -1 -1"/>

    <body name="torso" pos="0 0.9 0">
      <geom type="capsule" fromto="0 -0.07 0 0 0.07 0" size="0.06" rgba="0.3 0.5 0.8 1"/>
      <camera name="track" pos="0 1.5 -3" xyaxes="1 0 0 0 1 0" mode="trackcom"/>
      <joint name="root" type="slide" axis="1 0 0" limited="false"/>

      <body name="thigh" pos="0 -0.1 0.06">
        <joint name="hip" range="-45 45" axis="0 0 1"/>
        <geom type="capsule" fromto="0 0 0 0 -0.4 0" size="0.04" rgba="0.8 0.3 0.2 1"/>
        <body name="shin" pos="0 -0.4 0">
          <joint name="knee" range="-135 0" axis="0 0 1"/>
          <geom type="capsule" fromto="0 0 0 0 -0.35 0" size="0.035" rgba="0.3 0.8 0.2 1"/>
          <body name="foot" pos="0 -0.35 0">
            <geom type="capsule" fromto="-0.05 0 0 0.05 0 0" size="0.025" rgba="0.2 0.2 0.8 1"/>
          </body>
        </body>
      </body>

      <body name="thigh_left" pos="0 -0.1 -0.06">
        <joint name="hip_left" range="-45 45" axis="0 0 1"/>
        <geom type="capsule" fromto="0 0 0 0 -0.4 0" size="0.04" rgba="0.8 0.3 0.2 1"/>
        <body name="shin_left" pos="0 -0.4 0">
          <joint name="knee_left" range="-135 0" axis="0 0 1"/>
          <geom type="capsule" fromto="0 0 0 0 -0.35 0" size="0.035" rgba="0.3 0.8 0.2 1"/>
          <body name="foot_left" pos="0 -0.35 0">
            <geom type="capsule" fromto="-0.05 0 0 0.05 0 0" size="0.025" rgba="0.2 0.2 0.8 1"/>
          </body>
        </body>
      </body>
    </body>

    <geom type="plane" size="4 4 0.1" pos="0 -0.1 0" rgba="0.9 0.9 0.9 1"/>
  </worldbody>

  <actuator>
    <motor name="hip_motor" joint="hip"/>
    <motor name="knee_motor" joint="knee"/>
    <motor name="hip_left_motor" joint="hip_left"/>
    <motor name="knee_left_motor" joint="knee_left"/>
  </actuator>

  <!-- camera track referenced by renderer -->
</mujoco>`

export const CACHE_KEY = 'protosim_best_weights'

export const sampleRobots = [
  { name: 'Cartpole Swingup', xml: CARTWHEEL_XML, desc: 'Balance a pendulum on a cart using a single motor' },
  { name: 'Walker2D', xml: WALKER_XML, desc: 'Bipedal walker with 4 actuated joints' },
]
