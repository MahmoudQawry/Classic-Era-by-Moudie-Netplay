cmake_minimum_required(VERSION 3.22.1)
set(CMAKE_ANDROID_STL_TYPE c++_shared)
project("classicera_discord")

add_library(classicera_discord SHARED discord_bridge.cpp)

find_package(discord_partner_sdk REQUIRED CONFIG)

find_library(log-lib log)

target_link_libraries(
  classicera_discord
  discord_partner_sdk::discord_partner_sdk
  ${log-lib}
  android
)
