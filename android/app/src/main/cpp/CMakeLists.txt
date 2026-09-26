cmake_minimum_required(VERSION 3.22.1)
project(moudie_discord)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(moudie_discord SHARED discord_social.cpp)
target_include_directories(moudie_discord PRIVATE ${CMAKE_CURRENT_LIST_DIR}/discord)

if(ANDROID_ABI STREQUAL "arm64-v8a")
  add_library(discord_partner_sdk SHARED IMPORTED)
  set_target_properties(discord_partner_sdk PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_LIST_DIR}/../jniLibs/arm64-v8a/libdiscord_partner_sdk.so"
    INTERFACE_INCLUDE_DIRECTORIES "${CMAKE_CURRENT_LIST_DIR}/discord"
  )
  target_link_libraries(moudie_discord discord_partner_sdk log)
else()
  target_link_libraries(moudie_discord log)
endif()