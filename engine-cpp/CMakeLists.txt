cmake_minimum_required(VERSION 3.15)
project(dashzon_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Sem tipo de build, o cmake em Linux/macOS compila sem otimização (-O0).
# Em Visual Studio (multi-config) isso não se aplica: use --config Release.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(dashzon_engine src/main.cpp)
