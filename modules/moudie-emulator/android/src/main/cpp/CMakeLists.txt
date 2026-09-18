cmake_minimum_required(VERSION 3.10.2)
project(moudie_play_bridge)

add_library(moudie_play_bridge SHARED play_jni_bridge.cpp)

target_compile_features(moudie_play_bridge PRIVATE cxx_std_17)
target_link_libraries(moudie_play_bridge PRIVATE log dl)
